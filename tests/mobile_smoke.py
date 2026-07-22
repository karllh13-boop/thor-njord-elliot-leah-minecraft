from pathlib import Path
from playwright.sync_api import sync_playwright


OUT = Path("test-artifacts")
OUT.mkdir(exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        executable_path="/usr/bin/google-chrome",
        args=["--use-gl=angle", "--use-angle=swiftshader"],
    )
    context = browser.new_context(
        viewport={"width": 844, "height": 390},
        screen={"width": 844, "height": 390},
        is_mobile=True,
        has_touch=True,
        device_scale_factor=2,
        user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
    )
    page = context.new_page()
    errors = []
    page.on("console", lambda msg: errors.append(f"console: {msg.text}") if msg.type == "error" else None)
    page.on("pageerror", lambda error: errors.append(f"page: {error}"))

    page.goto("http://127.0.0.1:4173/?debug=1", wait_until="networkidle")
    page.locator('[data-character="thor"]').tap()
    page.locator("#play-button").tap()
    page.wait_for_timeout(1200)

    assert page.locator("#hud").is_visible()
    assert page.evaluate("getComputedStyle(document.querySelector('#mobile-controls')).display === 'block'")
    assert page.locator("#move-pad").is_visible()
    assert page.locator("#touch-jump").is_visible()
    assert page.locator("#touch-mine").is_visible()
    assert page.locator("#touch-build").is_visible()
    assert page.locator("#touch-camera").is_visible()
    assert not page.locator(".rotate-device").is_visible()

    # MINE must remove a targeted block and add it to counted inventory.
    target = page.evaluate("__BLOCKWORLD_DEBUG__.prepareInteractionTarget()")
    page.wait_for_function("() => __BLOCKWORLD_DEBUG__.aimed() !== null", timeout=3000)
    stone_before = page.evaluate("__BLOCKWORLD_DEBUG__.inventory().stone")
    page.locator("#touch-mine").tap()
    page.wait_for_timeout(150)
    assert page.evaluate("([x,y,z]) => __BLOCKWORLD_DEBUG__.blockAt(x,y,z)", target) is None
    assert page.evaluate("__BLOCKWORLD_DEBUG__.inventory().stone") == stone_before + 1

    # BUILD must place the selected block against the backstop and consume one.
    grass_before = page.evaluate("__BLOCKWORLD_DEBUG__.inventory().grass")
    page.locator("#touch-build").tap()
    page.wait_for_timeout(150)
    assert page.evaluate("([x,y,z]) => __BLOCKWORLD_DEBUG__.blockAt(x,y,z)", target) == "grass"
    assert page.evaluate("__BLOCKWORLD_DEBUG__.inventory().grass") == grass_before - 1

    # The guaranteed starter cache grants a tool and supplies when approached.
    page.evaluate("__BLOCKWORLD_DEBUG__.teleport(4, 4)")
    page.wait_for_timeout(350)
    starter_tools = page.evaluate("__BLOCKWORLD_DEBUG__.tools()")
    assert "wood_pick" in starter_tools["owned"]
    assert starter_tools["equipped"] == "wood_pick"

    # PACK crafting consumes ingredients, grants items, and equips crafted tools.
    page.locator("#pack-button").tap()
    assert page.locator("#pack-modal").is_visible()
    page.locator('[data-recipe="sticks"]').tap()
    assert page.evaluate("__BLOCKWORLD_DEBUG__.inventory().sticks") == 4
    page.locator('[data-recipe="stone_pick"]').tap()
    crafted_tools = page.evaluate("__BLOCKWORLD_DEBUG__.tools()")
    assert "stone_pick" in crafted_tools["owned"]
    assert crafted_tools["equipped"] == "stone_pick"
    assert page.evaluate("localStorage.getItem('four-builders-progress-v1') !== null")
    page.screenshot(path=str(OUT / "phone-pack.png"), full_page=True)
    page.locator("#close-pack").tap()

    cdp = context.new_cdp_session(page)

    def stick_drag(dx, dy, hold_ms=420):
        box = page.locator("#move-pad").bounding_box()
        cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        point = lambda x, y: {"x": x, "y": y, "id": 7, "radiusX": 8, "radiusY": 8, "force": 1}
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [point(cx, cy)]})
        cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [point(cx + dx, cy + dy)]})
        page.wait_for_timeout(hold_ms)
        state = page.evaluate("({ input: __BLOCKWORLD_DEBUG__.moveInput(), position: __BLOCKWORLD_DEBUG__.playerPosition() })")
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        page.wait_for_timeout(80)
        return state

    # A three-block-high grass wall must stop the full player body instead of letting it phase through.
    wall = page.evaluate("__BLOCKWORLD_DEBUG__.prepareCollisionWall()")
    blocked = stick_drag(0, -42, 1200)
    wall_front_limit = wall["wallZ"] + .5 + .31
    assert blocked["position"][2] >= wall_front_limit - .03
    assert not page.evaluate("__BLOCKWORLD_DEBUG__.collides()")

    # Diagonal input should slide sideways along that wall.
    before_slide_x = blocked["position"][0]
    slid = stick_drag(42, -42, 260)
    assert slid["position"][0] > before_slide_x + .08

    # The stick must map all four directions to different world-axis movement.
    page.evaluate("__BLOCKWORLD_DEBUG__.teleport(0, 0)")
    page.wait_for_timeout(100)
    origin = page.evaluate("__BLOCKWORLD_DEBUG__.playerPosition()")
    right = stick_drag(42, 0)
    assert right["input"][0] > .7 and abs(right["input"][1]) < .2
    assert right["position"][0] > origin[0] + .35

    page.evaluate("__BLOCKWORLD_DEBUG__.teleport(0, 0)")
    page.wait_for_timeout(100)
    left = stick_drag(-42, 0)
    assert left["input"][0] < -.7 and abs(left["input"][1]) < .2
    assert left["position"][0] < origin[0] - .35

    page.evaluate("__BLOCKWORLD_DEBUG__.teleport(0, 0)")
    page.wait_for_timeout(100)
    forward = stick_drag(0, -42)
    assert forward["input"][1] > .7 and abs(forward["input"][0]) < .2
    assert forward["position"][2] < origin[2] - .35

    page.evaluate("__BLOCKWORLD_DEBUG__.teleport(0, 0)")
    page.wait_for_timeout(100)
    backward = stick_drag(0, 42)
    assert backward["input"][1] < -.7 and abs(backward["input"][0]) < .2
    assert backward["position"][2] > origin[2] + .35
    assert page.evaluate("__BLOCKWORLD_DEBUG__.moveInput().every(value => value === 0)")

    # Swiping the world changes both horizontal and vertical view angles.
    before_view = page.evaluate("__BLOCKWORLD_DEBUG__.view()")
    look_point = lambda x, y: {"x": x, "y": y, "id": 9, "radiusX": 8, "radiusY": 8, "force": 1}
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [look_point(430, 140)]})
    cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [look_point(500, 175)]})
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    after_view = page.evaluate("__BLOCKWORLD_DEBUG__.view()")
    assert abs(after_view["yaw"] - before_view["yaw"]) > .3
    assert abs(after_view["pitch"] - before_view["pitch"]) > .1

    # A brief tap must queue a real jump, even if it begins and ends between frames.
    page.evaluate("__BLOCKWORLD_DEBUG__.teleport(0, 0)")
    page.wait_for_timeout(120)
    ground_y = page.evaluate("__BLOCKWORLD_DEBUG__.playerPosition()[1]")
    page.locator("#touch-jump").tap()
    page.wait_for_timeout(140)
    jump_y = page.evaluate("__BLOCKWORLD_DEBUG__.playerPosition()[1]")
    assert jump_y > ground_y + .25

    # Entering a lake must float the explorer near the surface rather than the bottom.
    water = page.evaluate("__BLOCKWORLD_DEBUG__.findWater()")
    page.evaluate("([x, y, z]) => __BLOCKWORLD_DEBUG__.teleport(x, z)", water)
    page.wait_for_timeout(350)
    water_state = page.evaluate("({ position: __BLOCKWORLD_DEBUG__.playerPosition(), state: __BLOCKWORLD_DEBUG__.state() })")
    assert water_state["state"]["playerInWater"]
    assert water_state["position"][1] >= 2.1

    # Walking into the distance generates new chunks while keeping the active set bounded.
    initial_world = page.evaluate("__BLOCKWORLD_DEBUG__.state()")
    page.evaluate("__BLOCKWORLD_DEBUG__.teleport(84, 36)")
    page.wait_for_timeout(450)
    expanded_world = page.evaluate("__BLOCKWORLD_DEBUG__.state()")
    assert expanded_world["generatedChunks"] > initial_world["generatedChunks"]
    assert expanded_world["worldBlocks"] > initial_world["worldBlocks"]
    assert expanded_world["activeChunks"] <= 25
    page.evaluate("__BLOCKWORLD_DEBUG__.teleport(0, 0)")
    page.wait_for_timeout(250)

    # Midnight changes the sky/HUD and spawns hostile Nightlings.
    page.evaluate("__BLOCKWORLD_DEBUG__.setTime(.75)")
    page.wait_for_timeout(500)
    night_state = page.evaluate("__BLOCKWORLD_DEBUG__.state()")
    assert night_state["nightActive"]
    assert night_state["monsters"] >= 1
    assert page.locator("#time-display").get_attribute("class").endswith("night")
    assert "show" in page.locator("#danger-banner").get_attribute("class")
    page.screenshot(path=str(OUT / "phone-night.png"), full_page=True)

    # MINE attacks a centered Nightling and sunrise removes every remaining monster.
    page.evaluate("__BLOCKWORLD_DEBUG__.setView(0, 0); __BLOCKWORLD_DEBUG__.spawnMonsterAhead()")
    page.wait_for_timeout(100)
    assert page.evaluate("__BLOCKWORLD_DEBUG__.monsterHealth()") == [3]
    page.locator("#touch-mine").tap()
    page.wait_for_timeout(100)
    assert page.evaluate("__BLOCKWORLD_DEBUG__.monsterHealth()[0]") == 1
    page.evaluate("__BLOCKWORLD_DEBUG__.setTime(.08)")
    page.wait_for_timeout(150)
    assert page.evaluate("__BLOCKWORLD_DEBUG__.state().monsters") == 0
    assert "show" not in page.locator("#danger-banner").get_attribute("class")

    # Camera and block palette controls.
    camera_before = page.evaluate("__BLOCKWORLD_DEBUG__.view().thirdPerson")
    page.locator("#touch-camera").tap()
    assert page.evaluate("__BLOCKWORLD_DEBUG__.view().thirdPerson") != camera_before
    page.locator('[data-slot="4"]').tap()
    assert "selected" in page.locator('[data-slot="4"]').get_attribute("class")

    # In-game help must show the phone-specific guide.
    page.locator("#help-button").tap()
    assert page.locator(".mobile-guide").is_visible()
    page.locator("#close-help").tap()

    # Portrait blocks gameplay with a clear rotate-phone instruction.
    page.set_viewport_size({"width": 390, "height": 844})
    assert page.locator(".rotate-device").is_visible()
    page.set_viewport_size({"width": 844, "height": 390})
    assert not page.locator(".rotate-device").is_visible()

    page.screenshot(path=str(OUT / "phone-landscape.png"), full_page=True)

    assert not errors, "Browser errors:\n" + "\n".join(errors)
    print("PASS: full-body wall collision, wall sliding, mine/build, loot, crafting, tuned movement, water, chunks, combat, HUD, and rotation")
    context.close()
    browser.close()
