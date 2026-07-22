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
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    errors = []
    page.on("console", lambda msg: errors.append(f"console: {msg.text}") if msg.type == "error" else None)
    page.on("pageerror", lambda error: errors.append(f"page: {error}"))

    page.goto("http://127.0.0.1:4173", wait_until="networkidle")
    assert page.locator(".character-card").count() == 4
    assert page.locator("h1").get_by_text("MINECRAFT").is_visible()
    assert page.locator("#play-button").is_disabled()

    page.locator('[data-character="leah"]').click()
    assert page.locator('[data-character="leah"]').get_attribute("class").endswith("selected")
    assert page.locator("#play-button").is_enabled()
    page.screenshot(path=str(OUT / "character-select.png"), full_page=True)

    page.locator("#play-button").click()
    page.wait_for_timeout(1800)
    assert page.locator("#hud").is_visible()
    assert "LEAH" in page.locator("#player-badge").inner_text()
    assert page.locator("#hotbar .slot").count() == 6
    assert page.evaluate("document.querySelector('#game').getContext('webgl2') !== null")

    page.keyboard.press("Digit4")
    assert "WOOD" in page.locator("#hotbar .slot.selected").inner_text()
    page.keyboard.press("KeyT")
    page.wait_for_timeout(500)
    page.screenshot(path=str(OUT / "world-loaded.png"), full_page=True)

    assert not errors, "Browser errors:\n" + "\n".join(errors)
    print("PASS: character select, game launch, WebGL world, HUD, hotbar, and camera input")
    browser.close()
