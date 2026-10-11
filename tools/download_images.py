import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Accept': 'image/avif,image/webp,image/png,image/jpeg,*/*',
    'Referer': 'https://attackontitan.fandom.com/',
}
SIGNATURES = (b'\x89PNG\r\n\x1a\n', b'\xff\xd8\xff', b'GIF8', b'RIFF')


def read_json(path):
    with open(path, encoding='utf-8') as handle:
        return json.load(handle)


def fetch(url, attempts=3):
    last = None
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(request, timeout=30) as response:
                body = response.read()
            if body.startswith(SIGNATURES):
                return body
            last = 'not an image'
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            last = str(error)
        time.sleep(1 + attempt)
    raise RuntimeError(last)


def main():
    force = '--force' in sys.argv
    catalog = read_json(ROOT / 'data' / 'characters.json')
    sources = read_json(ROOT / 'tools' / 'sources.json')
    targets = {c['name']: c['img'] for cat in catalog['categories'] for c in cat['characters'] if c['img']}
    done = skipped = 0
    failed = []
    for name, url in sources.items():
        rel = targets.get(name)
        if not rel:
            continue
        path = ROOT / rel
        if path.exists() and path.stat().st_size > 0 and not force:
            skipped += 1
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            path.write_bytes(fetch(url))
            done += 1
            print('ok      ' + rel)
        except RuntimeError as error:
            failed.append(name)
            print('failed  ' + rel + '  (' + str(error) + ')')
    print('downloaded: %d, already present: %d, failed: %d' % (done, skipped, len(failed)))
    if failed:
        print('Missing images fall back to generated placeholders. Run the script again to retry.')
        sys.exit(1)


if __name__ == '__main__':
    main()
