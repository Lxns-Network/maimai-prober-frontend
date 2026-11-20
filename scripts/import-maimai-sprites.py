"""导入本地 SDEZ 1.70 默认皮肤。参数为导出工程的 Assets/Resources 目录，需 Pillow。"""

import argparse
import json
import re
from pathlib import Path

from PIL import Image, ImageOps


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("resources", type=Path)
    resources = parser.parse_args().resources
    output = Path(__file__).resolve().parents[1] / "packages/maimai-chart-engine/src/renderers/webgl/sprites"
    output.mkdir(exist_ok=True)
    entries = {}
    for sprite in json.loads((resources / "FullSpriteMap.json").read_text())["sprites"]:
        if sprite["ppu"] == 1:
            entries.setdefault(sprite["name"], sprite)

    def texture(name):
        return Image.open(resources / "FullTextures" / (name + ".png")).convert("RGBA")

    def sprite_image(name):
        entry = entries[name]
        image = texture(entry["texture"])
        rect = entry["rect"]
        x, y, w, h = (int(rect[k]) for k in ("x", "y", "width", "height"))
        return image.crop((x, image.height-y-h, x+w, image.height-y))

    for name in ["Normal", "Break", "Each", "Slide", "EachBar", "Outline_18"]:
        sprite_image(name).save(output / (name + ".webp"), lossless=True)

    names = ["UI_GAM_Perfect", "UI_GAM_Perfect_Break", "Tap_00", "Tap_Each_00",
             "Tap_Ex_00", "Break_00", "Break_EFF_00", "Break_Ex_00", "Hold_Ex_00", "BreakHold_Ex_00"]
    names += [f"UI_GAM_{family}_{direction}_Perfect{extra}"
              for family, directions in [("Slide", "LR"), ("SlideCircle", "LR"), ("SlideFan", "DU")]
              for direction in directions for extra in ("", "_Break")]
    names += [s + "_00" for s in ("Slide", "Slide_Each", "BreakSlide")]
    names += [s + m + "_00" for s in ("Star", "Star_Each", "Star_Pink", "BreakStar", "Star_Ex", "BreakStar_Ex")
              for m in ("", "_Double")]
    names += [s + "_" + d for s in ("Hold", "Hold_Each", "BreakHold") for d in ("00", "On_00", "End")]
    names += ["UI_NOTES_Touch_" + s for s in ("01", "Each_01", "Point", "Each_Point", "Hold_01",
              "Hold_02", "Hold_03", "Hold_04", "Hold_hold", "two", "three", "Each_two", "Each_three")]
    images = {n: (sprite_image(n), entries[n]["pivot"]["x"], 1-entries[n]["pivot"]["y"]) for n in names}

    # FullRecovered1 的 PERFECT 行位于自下向上的第 3 行。
    for key, source, columns in [("HitStar", "resources_3472", 4), ("BreakFlash", "resources_1976", 1)]:
        sheet = texture(source)
        w, h = sheet.width // columns, sheet.height // 4
        for i in range(columns):
            images[key + str(i)] = (sheet.crop((i*w, h, (i+1)*w, 2*h)), .5, .5)
    for key, source in [("HitRing", "resources_408"), ("HoldRipple", "resources_2389")]:
        images[key] = (texture(source), .5, .5)

    # SlideFan 的 R 是 L 的镜像子节点，合成一整根箭头并保留相对圆心的位置。
    fan = (resources / "FullPrefabs/SlideFan.prefab").read_text()
    for block in re.split(r"(?m)^--- !u!1 &", fan)[1:]:
        name = re.search(r"m_Name: Fan(\d+)L\n", block)
        if name is None:
            continue
        i = int(name[1])
        left = sprite_image(f"MM_UI_Game_{52+i:03d}")
        arrow = Image.new("RGBA", (2*left.width, left.height))
        arrow.paste(left)
        arrow.paste(ImageOps.mirror(left), (left.width, 0))
        y = float(re.search(r"m_LocalPosition: \{x: [^,]+, y: ([^,]+)", block)[1])
        images[f"Fan{i}"] = (arrow, .5, .5+y/left.height)

    atlas = Image.new("RGBA", (2048, 2048))
    frames = {}
    x = y = row = 0
    for key, (img, px, py) in sorted(images.items(), key=lambda item: (-item[1][0].height, item[0])):
        w, h = img.size
        if x+w+2 > atlas.width:
            x, y, row = 0, y+row, 0
        if y+h+2 > atlas.height:
            raise ValueError("Default skin exceeds atlas size")
        atlas.paste(img, (x+1, y+1))
        frames[key] = [x+1, y+1, w, h, px, py]
        x += w+2
        row = max(row, h+2)
    atlas.crop((0, 0, atlas.width, y+row)).save(output / "notes.webp", lossless=True)
    lines = [f'  "{k}": {json.dumps(v)}' for k,v in sorted(frames.items())]
    (output / "frames.json").write_text("{\n" + ",\n".join(lines) + "\n}\n")


if __name__ == "__main__":
    main()
