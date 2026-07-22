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
    print("PASS: four-way joystick, swipe-look, buffered jump, water float, camera, hotbar, help, and rotation")
    context.close()
    browser.close()
