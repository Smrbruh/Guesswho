import concurrent.futures
import argparse
import io
import json
import subprocess
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SPECS = ROOT / 'tools/expanded-packs.json'

def download(character):
    path = ROOT / 'public' / character['img'].lstrip('/')
    if path.exists():
        with Image.open(path) as image:
            if image.format == 'WEBP' and image.size == (360, 440):
                return character['id']
    response = subprocess.run(['curl.exe', '-fLsS', '--retry', '2', '--max-time', '30', character['source']], capture_output=True)
    if response.returncode:
        raise RuntimeError(character['id'] + ': download failed')
    original = Image.open(io.BytesIO(response.stdout))
    if min(original.size) < 80:
        raise RuntimeError(character['id'] + ': source too small')
    original = ImageOps.exif_transpose(original).convert('RGBA')
    background = Image.new('RGBA', original.size, (35, 40, 49, 255))
    background.alpha_composite(original)
    if character.get('fit') == 'contain':
        portrait = Image.new('RGB', (360, 440), (35, 40, 49))
        fitted = ImageOps.contain(background.convert('RGB'), (336, 400), Image.Resampling.LANCZOS)
        portrait.paste(fitted, ((360-fitted.width)//2, (440-fitted.height)//2))
    else:
        portrait = ImageOps.fit(background.convert('RGB'), (360, 440), Image.Resampling.LANCZOS, centering=tuple(character['crop']))
    path.parent.mkdir(parents=True, exist_ok=True)
    portrait.save(path, 'WEBP', quality=83, method=6)
    if path.stat().st_size >= 100000:
        raise RuntimeError(character['id'] + ': image exceeds size budget')
    return character['id']

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--spec', default=str(SPECS))
    parser.add_argument('--migration', default='202610110022_expanded_universes.sql')
    args = parser.parse_args()
    specs = json.loads(Path(args.spec).read_text('utf-8'))
    jobs = [c for deck in specs for c in deck['characters']]
    failures = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        tasks = {pool.submit(download, character): character for character in jobs}
        for task in concurrent.futures.as_completed(tasks):
            try:
                print('OK', task.result(), flush=True)
            except Exception as error:
                failures.append(str(error))
                print('FAIL', error, flush=True)
    if failures:
        raise SystemExit(f'{len(failures)} portraits failed; catalog left unchanged')
    expanded = [{**{key: value for key, value in deck.items() if key != 'characters'}, 'characters': [{key: value for key, value in c.items() if key not in ('source', 'sourcePage', 'crop', 'fit')} for c in deck['characters']]} for deck in specs]
    ids = {d['id'] for d in expanded}
    catalog_path = ROOT / 'src/data/catalog.json'
    catalog = [d for d in json.loads(catalog_path.read_text('utf-8')) if d['id'] not in ids] + expanded
    catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    sources_path = ROOT / 'data/asset-sources.json'
    replaced = {c['id'] for c in jobs}
    sources = [entry for entry in json.loads(sources_path.read_text('utf-8')) if entry['id'] not in replaced]
    sources += [dict(id=c['id'], name=c['nameEn'], source=c['source'], sourcePage=c['sourcePage'], file=c['img']) for c in jobs]
    sources_path.write_text(json.dumps(sources, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    quote = lambda value: "'" + value.replace("'", "''") + "'"
    rows = ',\n'.join('(' + quote(c['id']) + ',' + quote(d['id']) + ')' for d in expanded for c in d['characters'])
    sql = 'insert into game_private.characters(id,category) values\n' + rows + '\non conflict(id) do nothing;\n'
    for deck in expanded:
        sql += 'insert into public.decks(id,data,published) values(' + quote(deck['id']) + ',' + quote(json.dumps(deck, ensure_ascii=False)) + '::jsonb,true) on conflict(id) do update set data=excluded.data,published=true,updated_at=now() where public.decks.owner_id is null;\n'
    (ROOT / 'supabase/migrations' / args.migration).write_text(sql, 'utf-8')
    print('Ready:', len(jobs), 'portraits in', len(expanded), 'packs')

if __name__ == '__main__':
    main()
