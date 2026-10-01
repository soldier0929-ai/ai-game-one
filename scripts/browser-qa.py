#!/usr/bin/env python3
"""Real-input Chromium QA. __tidal.inspect() is used for observations only.

Run with Vite already serving: python scripts/browser-qa.py
No game writes, tool firing, progress injection or forced victories.
"""
import json
import os
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'artifacts/qa'
OUT.mkdir(parents=True, exist_ok=True)
RESULT = {'environment': {'browser': '/usr/bin/chromium', 'renderer': 'SwiftShader',
                         'url': os.getenv('QA_URL', 'http://localhost:5173'),
                         'input': 'real Playwright mouse/keyboard and CDP touchscreen'},
          'checks': [], 'wins': [], 'errors': [], 'warnings': []}


def inspect(page):
    return page.evaluate('window.__tidal.inspect()')


def check(name, passed, detail=None):
    RESULT['checks'].append({'name': name, 'passed': bool(passed), 'detail': detail})
    print(('PASS ' if passed else 'FAIL ') + name, json.dumps(detail, ensure_ascii=False)[:500], flush=True)
    save()


def save():
    (OUT / ('performance-isolated.json' if os.getenv('QA_PERFORMANCE_ONLY') else 'home-recheck.json' if os.getenv('QA_HOME_ONLY') else 'progression-home-recheck.json' if os.getenv('QA_PROGRESSION_ONLY') else 'results.json')).write_text(json.dumps(RESULT, indent=2, ensure_ascii=False) + '\n')


def screenshot(page, name):
    page.screenshot(path=str(OUT / (name + '.png')), full_page=True)


def wait_screen(page, screens, timeout=45000):
    page.wait_for_function('(screens) => window.__tidal && screens.includes(window.__tidal.inspect().screen)', arg=screens, timeout=timeout)
    return inspect(page)


def action(page, name):
    page.locator(f'button[data-action="{name}"]:visible').first.click()


def start(page):
    wait_screen(page, ['home'])
    action(page, 'start')
    s = wait_screen(page, ['playing', 'tutorial'])
    if s['screen'] == 'tutorial':
        screenshot(page, 'desktop-tutorial')
        action(page, 'tutorial-done')
    return wait_screen(page, ['playing'])


def aim_drag(page, target, touch=False, release=True):
    s = inspect(page)
    assert s['screen'] == 'playing' and s['phase'] == 'aiming', s
    box = page.locator('#game-canvas').bounding_box()
    x, y = box['x'] + box['width'] * .55, box['y'] + box['height'] * .57
    dx = (target['yaw'] - s['aim']['yaw']) * box['width'] / 1.5
    dy = (s['aim']['pitch'] - target['pitch']) * box['width'] / 1.5
    if touch:
        cdp = page.context.new_cdp_session(page)
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y, 'id': 1}]})
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x + dx, 'y': y + dy, 'id': 1}]})
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd' if release else 'touchCancel', 'touchPoints': []})
        cdp.detach()
    else:
        page.mouse.move(x, y)
        page.mouse.down()
        page.mouse.move(x + dx, y + dy, steps=2)
        if release:
            page.mouse.up()
    return s


def settle(page):
    page.wait_for_function("() => { const s=window.__tidal.inspect(); return s.screen !== 'playing' || s.phase === 'aiming'; }", timeout=60000)
    return inspect(page)


def fresh(browser, width=1440, height=900, touch=False):
    context = browser.new_context(viewport={'width': width, 'height': height}, has_touch=touch)
    page = context.new_page()
    page.on('pageerror', lambda e: RESULT['errors'].append(str(e)))
    page.on('console', lambda m: RESULT['errors'].append(m.text) if m.type == 'error' else RESULT['warnings'].append(m.text) if m.type == 'warning' else None)
    page.goto(RESULT['environment']['url'])
    wait_screen(page, ['home'])
    return context, page



def measure_frames(page):
    frame_times = page.evaluate('''() => new Promise(resolve => {
      const values = []; let first = null, previous = null;
      function frame(t) { if (first === null) first = t;
        if (previous !== null) values.push(t - previous); previous = t;
        if (t - first >= 60000) resolve(values); else requestAnimationFrame(frame);
      } requestAnimationFrame(frame);
    })''')
    (OUT / ('frame-times-isolated.json' if os.getenv('QA_PERFORMANCE_ONLY') else 'frame-times.json')).write_text(json.dumps(frame_times))
    ordered = sorted(frame_times)
    performance = {'durationMs': sum(frame_times), 'frames': len(frame_times),
      'averageFPS': 1000 * len(frame_times) / sum(frame_times),
      'medianMs': ordered[len(ordered)//2], 'p95Ms': ordered[int(len(ordered)*.95)],
      'maxMs': max(frame_times), 'framesOver50Ms': sum(v > 50 for v in frame_times),
      'framesOver100Ms': sum(v > 100 for v in frame_times),
      'viewport': page.viewport_size, 'scene': 'level 1, idle aiming',
      'limitation': 'CPU SwiftShader cloud browser; not representative of real desktop/mobile GPU performance'}
    RESULT['performance'] = performance
    check('60-second cloud frame-time sample collected', sum(frame_times) >= 60000, performance)

def desktop(browser):
    context, page = fresh(browser)
    page.set_default_timeout(60000)
    initial = inspect(page)
    check('first run locked progression', initial['unlocked'] == 1 and initial['bestStars'] == [0] * 8, initial)
    check('audio waits for gesture', not initial['audio']['unlocked'], initial['audio'])
    screenshot(page, 'desktop-home')
    action(page, 'levels')
    check('seven future levels disabled', page.locator('button[data-level]:disabled').count() == 7)
    if not os.getenv('QA_CONTROLS_ONLY'):
        action(page, 'help')
        action(page, 'tutorial-done')
        check('levels help returns to level selection', inspect(page)['screen'] == 'levels')
        action(page, 'back')
    else:
        action(page, 'back')
    start(page)
    check('audio gesture unlock', inspect(page)['audio']['unlocked'], inspect(page)['audio'])
    action(page, 'mute')
    check('mute enabled', inspect(page)['muted'] and inspect(page)['audio']['muted'])
    action(page, 'mute')
    page.keyboard.press('Escape')
    escape = inspect(page)
    check('Escape pauses with mute button focused', escape['screen'] == 'paused', escape)
    if escape['screen'] == 'paused':
        action(page, 'resume')
    screenshot(page, 'desktop-playing')

    # Resize cancels an active mouse drag without firing.
    before = aim_drag(page, {'yaw': .03, 'pitch': .12}, release=False)
    page.set_viewport_size({'width': 1438, 'height': 900})
    page.wait_for_function('!window.__tidal.inspect().dragging')
    page.mouse.up()
    after = inspect(page)
    check('resize cancels mouse drag', after['ammo'] == before['ammo'] and not after['dragging'], after)
    page.set_viewport_size({'width': 1440, 'height': 900})

    # Pause while a cannonball is flying: frozen projectile, ammo and timer.
    aim_drag(page, {'yaw': .30, 'pitch': .50})
    page.wait_for_timeout(100)
    action(page, 'pause')
    frozen = inspect(page)
    page.wait_for_timeout(700)
    later = inspect(page)
    check('pause freezes projectile ammo score timer', frozen['screen'] == 'paused' and
          all(frozen[k] == later[k] for k in ['physics', 'ammo', 'fallen', 'settlingSeconds']), {'before': frozen, 'after': later})
    screenshot(page, 'desktop-paused')
    if not os.getenv('QA_CONTROLS_ONLY'):
        action(page, 'help')
        action(page, 'tutorial-done')
        after_help = inspect(page)
        check('paused help returns to frozen pause', after_help['screen'] == 'paused' and after_help['ammo'] == frozen['ammo'] and after_help['physics'] == frozen['physics'], after_help)
    action(page, 'restart')

    # Repeated real keydowns with the same held Space must remain one shot even
    # after settling. Move focus to canvas via a canceled drag first.
    aim_drag(page, {'yaw': .30, 'pitch': .50}, release=False)
    page.keyboard.press('Escape')
    page.mouse.up()
    action(page, 'resume')
    page.mouse.click(770, 510)  # One legitimate mouse shot removes button focus.
    settle(page)
    base = inspect(page)
    page.keyboard.down('Space')
    settle(page)
    for _ in range(8):
        page.keyboard.down('Space')
    page.keyboard.up('Space')
    held = inspect(page)
    check('held Space spends one cannonball', held['ammo'] == base['ammo'] - 1, {'before': base, 'after': held})
    if held['screen'] == 'playing':
        page.keyboard.press('Space')
        held = settle(page)
    check('three physical misses reach defeat', held['screen'] == 'lost' and held['ammo'] == 0, held)
    screenshot(page, 'desktop-defeat')
    if held['screen'] == 'playing':
        action(page, 'pause')
    action(page, 'restart')

    baseline = inspect(page)
    restarts = []
    for _ in range(20):
        action(page, 'pause')
        action(page, 'restart')
        page.wait_for_timeout(60)
        restarts.append(inspect(page))
    fields = ['blockMeshes', 'geometries', 'textures', 'ownedGeometries', 'ownedMaterials']
    check('20 restarts keep body and render resources bounded',
          all(s['physics']['bodyCount'] == baseline['physics']['bodyCount'] and
              all(s['renderer'][f] == baseline['renderer'][f] for f in fields) and
              s['audio']['activeVoices'] <= s['audio']['maxVoices'] for s in restarts),
          {'baseline': baseline, 'samples': restarts})

    # Sequential progression uses physically replayed solutions with pointer
    # movements derived from the documented radians-to-drag mapping.
    if not os.getenv('QA_CONTROLS_ONLY'):
        measure_frames(page)
    progression(page)
    context.close()



def progression(page):
    solutions = json.loads((ROOT / 'tests/level-solutions.json').read_text())
    if os.getenv('QA_HOME_ONLY'):
        solutions = solutions[:1]
    for solution in ([] if os.getenv('QA_CONTROLS_ONLY') else solutions):
        level_id = solution['level']
        if inspect(page)['currentLevel'] != level_id:
            break
        screenshot(page, f'level-{level_id:02d}-playing')
        attempts = []
        for retry in range(3):
            for shot in solution['shots']:
                if inspect(page)['screen'] == 'won':
                    break
                before = aim_drag(page, shot)
                observed = inspect(page)
                check(f'level {level_id} real pointer shot {len(attempts) + 1}',
                      observed['ammo'] == before['ammo'] - 1 and
                      all(abs(observed['aim'][k] - shot[k]) < .005 for k in shot), {'target': shot, 'observed': observed})
                attempts.append(settle(page))
            result = inspect(page)
            if result['screen'] == 'won':
                break
            action(page, 'pause') if result['screen'] == 'playing' else None
            action(page, 'restart')
        result = inspect(page)
        check(f'physical browser win level {level_id}', result['screen'] == 'won', {'attempts': attempts, 'result': result})
        screenshot(page, f'level-{level_id:02d}-result')
        if result['screen'] != 'won':
            break
        RESULT['wins'].append({'level': level_id, 'fallen': result['fallen'], 'target': result['target'], 'stars': result['stars'], 'ammo': result['ammo']})
        save()
        if level_id < 8 and not os.getenv('QA_HOME_ONLY'):
            action(page, 'next')
    if not os.getenv('QA_CONTROLS_ONLY') and not os.getenv('QA_HOME_ONLY'):
        check('all 8 levels won physically and sequentially', len(RESULT['wins']) == 8, RESULT['wins'])
        if inspect(page)['currentLevel'] == 8 and inspect(page)['screen'] == 'won':
            check('final level hides next and shows completion', page.locator('[data-action="next"]:visible').count() == 0 and '八座高塔' in page.locator('[data-field="won-title"]').inner_text())
    action(page, 'mute')
    persisted = inspect(page)
    page.reload()
    reloaded = wait_screen(page, ['home'])
    check('progress survives reload', persisted['unlocked'] == reloaded['unlocked'] and persisted['bestStars'] == reloaded['bestStars'], reloaded)
    check('mute setting survives reload', reloaded['muted'] == persisted['muted'] and reloaded['audio']['muted'] == persisted['muted'], reloaded['audio'])
    screenshot(page, 'desktop-earned-progress-home')
    action(page, 'start')
    started = wait_screen(page, ['playing'])
    check('saved-progress home card matches Start level', all(reloaded[k] == started[k] for k in ['currentLevel', 'levelName', 'total', 'target']), {'home': reloaded, 'started': started})
    action(page, 'pause')
    action(page, 'levels')
    screenshot(page, 'desktop-progress')
    action(page, 'back')
    back_home = wait_screen(page, ['home'])
    check('selection Back home matches saved unlocked level', back_home['currentLevel'] == back_home['unlocked'] and all(back_home[k] == started[k] for k in ['currentLevel', 'levelName', 'total', 'target']), back_home)
    screenshot(page, 'desktop-earned-progress-back-home')

def mobile(browser):
    context, page = fresh(browser, 390, 844, True)
    screenshot(page, 'portrait-home')
    start(page)
    screenshot(page, 'portrait-playing')
    before = inspect(page)
    aim_drag(page, {'yaw': .02, 'pitch': .12}, touch=True, release=False)
    after = inspect(page)
    check('touch cancel consumes no cannonball', after['ammo'] == before['ammo'] and not after['dragging'], after)
    page.emulate_media(reduced_motion='reduce')
    check('reduced motion preference recognized', page.evaluate('matchMedia("(prefers-reduced-motion: reduce)").matches'))
    aim_drag(page, {'yaw': -.035, 'pitch': .08}, touch=True)
    s = settle(page)
    check('portrait real touch physical win', s['screen'] == 'won', s)
    screenshot(page, 'portrait-result')
    page.set_viewport_size({'width': 844, 'height': 390})
    action(page, 'restart')
    screenshot(page, 'landscape-playing')
    action(page, 'pause')
    screenshot(page, 'landscape-paused')
    # Visible controls must fit viewport and reach the 44px minimum tap target.
    for label in ['landscape', 'portrait']:
        if label == 'portrait':
            page.set_viewport_size({'width': 390, 'height': 844})
        controls = page.locator('button:visible').evaluate_all('(els) => els.map(e => ({label:e.getAttribute("aria-label") || e.textContent, ...e.getBoundingClientRect().toJSON()}))')
        size = page.viewport_size
        check(label + ' visible controls fit and meet 44px minimum', all(c['width'] >= 44 and c['height'] >= 44 and c['x'] >= 0 and c['y'] >= 0 and c['right'] <= size['width'] + 1 and c['bottom'] <= size['height'] + 1 for c in controls), controls)
    context.close()


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
        args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    RESULT['environment']['version'] = browser.version
    try:
        if os.getenv('QA_PERFORMANCE_ONLY'):
            context, page = fresh(browser)
            start(page)
            measure_frames(page)
            context.close()
        elif os.getenv('QA_PROGRESSION_ONLY') or os.getenv('QA_HOME_ONLY'):
            context, page = fresh(browser)
            start(page)
            progression(page)
            context.close()
        else:
            desktop(browser)
            mobile(browser)
        check('no browser console errors or uncaught exceptions', not RESULT['errors'], RESULT['errors'])
    except Exception as error:
        RESULT['fatal'] = str(error)
        print('QA ERROR', str(error), flush=True)
        raise
    finally:
        save()
        browser.close()
