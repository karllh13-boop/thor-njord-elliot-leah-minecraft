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

    page.goto("http://127.0.0.1:4173", wait_until="networkidle")
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

    page.locator("#touch-camera").tap()
    page.locator('[data-slot="4"]').tap()
    assert "selected" in page.locator('[data-slot="4"]').get_attribute("class")
    page.locator("#touch-jump").tap()
    page.wait_for_timeout(500)
    page.screenshot(path=str(OUT / "phone-landscape.png"), full_page=True)

    assert not errors, "Browser errors:\n" + "\n".join(errors)
    print("PASS: phone landscape, touch HUD, character launch, camera, jump, and hotbar")
    context.close()
    browser.close()
