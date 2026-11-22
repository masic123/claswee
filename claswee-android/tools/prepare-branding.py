from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent
res = root / 'android/app/src/main/res'
brand = Image.open(root / 'public/icon.png').convert('RGBA')
background = '#f8dce7'
for name, density in [('mdpi', 1), ('hdpi', 1.5), ('xhdpi', 2), ('xxhdpi', 3), ('xxxhdpi', 4)]:
    folder = res / f'mipmap-{name}'
    side = int(48 * density)
    icon = brand.resize((side, side), Image.Resampling.LANCZOS)
    icon.save(folder / 'ic_launcher.png')
    mask = Image.new('L', (side, side))
    ImageDraw.Draw(mask).ellipse((0, 0, side-1, side-1), fill=255)
    rounded = icon.copy()
    rounded.putalpha(mask)
    rounded.save(folder / 'ic_launcher_round.png')
    adaptive_side = int(108 * density)
    foreground = Image.new('RGBA', (adaptive_side, adaptive_side))
    content_side = int(adaptive_side * .82)
    foreground.alpha_composite(brand.resize((content_side, content_side), Image.Resampling.LANCZOS), ((adaptive_side-content_side)//2, (adaptive_side-content_side)//2))
    foreground.save(folder / 'ic_launcher_foreground.png')
for file in res.glob('drawable*/splash.png'):
    with Image.open(file) as previous:
        size = previous.size
    canvas = Image.new('RGB', size, background)
    side = max(72, int(min(size)*.25))
    icon = brand.resize((side, side), Image.Resampling.LANCZOS)
    canvas.paste(icon, ((size[0]-side)//2, (size[1]-side)//2), icon)
    canvas.save(file)
(res / 'drawable-v24/ic_launcher_foreground.xml').write_text('''<?xml version="1.0" encoding="utf-8"?>
<bitmap xmlns:android="http://schemas.android.com/apk/res/android" android:src="@mipmap/ic_launcher_foreground" android:gravity="fill" />
''', encoding='utf-8')
(res / 'values/ic_launcher_background.xml').write_text('''<?xml version="1.0" encoding="utf-8"?>
<resources><color name="ic_launcher_background">#f8dce7</color><color name="claswee_splash_background">#fff6fa</color></resources>
''', encoding='utf-8')
print('Reused the mini-program brand icon for Android launcher and splash images.')
