# Thor, Njord, Elliot & Leah's Minecraft

An original browser-based voxel sandbox made for four young explorers.

The world streams outward in procedural chunks as the player explores. A four-minute day/night cycle drives sunrise, daylight, sunset, moonlight, stars, and hostile Nightlings. Nightlings can be attacked with the normal mine control, damage the player's five-heart health bar on contact, and retreat at sunrise.

Mining adds blocks to a persistent counted inventory and building consumes them. Procedural supply caches contain resources and tools including wood/stone picks, a trail axe, and a stone sword. The in-game PACK screen supports tool equipping and crafting recipes for sticks, tools, weapons, bricks, and block bundles.

Movement uses full-body voxel collision with wall sliding, one-block step-up, ceiling and floor collision, acceleration, air control, head bob, landing response, and sprint field-of-view. First-person mode includes the selected character's arm, equipped tools, action swings, and block particles.

## Play online

Open the public game link in landscape orientation on a phone, tablet, or computer. Touch controls appear automatically on mobile devices.

## Play locally

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5173` and choose Thor, Njord, Elliot, or Leah.

## Controls

- `W A S D` — move
- Mouse — look
- `Space` — jump
- `Shift` — sprint
- Left click — mine a block
- Right click — place a block
- `1–6` — choose a block
- `T` — switch between first-person and explorer cameras
- `Esc` — pause

### Phone controls

- Left thumbstick — move and sprint
- Drag the world — look around
- `JUMP`, `MINE`, and `BUILD` — action buttons
- `VIEW` — switch camera
- Tap a hotbar block — select it

## Production build

```bash
pnpm build
pnpm preview
```

All visuals, textures, characters, interface code, and world-generation code are original to this project.
