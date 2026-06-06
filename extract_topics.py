import urllib.request
import json
import re
import sys

url = 'https://takeuforward.org/dsa/strivers-a2z-sheet-learn-dsa-a-to-z'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})

print("Fetching page...")
with urllib.request.urlopen(req) as resp:
    html = resp.read().decode('utf-8')

print(f"Got {len(html)} bytes")

# Extract Next.js flight data pieces
pieces = []
for m in re.finditer(r'self\.__next_f\.push\(\[1,"((?:\\.|[^"\\])*)"\]\)', html):
    raw = m.group(1)
    try:
        pieces.append(json.loads('"' + raw + '"'))
    except:
        pieces.append(raw)

flight = ''.join(pieces)
print(f"Flight text: {len(flight)} chars")

# Try multiple candidates
def unescape(val):
    return val.replace('\\u0026', '&').replace('\\"', '"').replace('\\/', '/')

def try_extract(text):
    marker = '"sections":'
    idx = text.find(marker)
    if idx < 0:
        marker = '\\"sections\\":'
        idx = text.find(marker)
    if idx < 0:
        return None
    
    start = text.rfind('{', 0, idx)
    if start < 0:
        return None
    
    depth = 0
    in_str = False
    esc = False
    for i in range(start, len(text)):
        c = text[i]
        if esc:
            esc = False
            continue
        if c == '\\':
            esc = True
            continue
        if c == '"':
            in_str = not in_str
            continue
        if in_str:
            continue
        if c == '{':
            depth += 1
        if c == '}':
            depth -= 1
            if depth == 0:
                try:
                    parsed = json.loads(text[start:i+1])
                    if isinstance(parsed.get('sections'), list):
                        return parsed
                except:
                    return None
    return None

for candidate in [flight, unescape(flight), html, unescape(html)]:
    payload = try_extract(candidate)
    if payload:
        result = []
        for s in payload['sections']:
            section = {
                'name': s['category_name'],
                'subcategories': []
            }
            for sub in s['subcategories']:
                subcategory = {
                    'name': sub['subcategory_name'],
                    'problems': [p['problem_name'] for p in sub['problems']]
                }
                section['subcategories'].append(subcategory)
            result.append(section)
        
        with open('extracted_data.json', 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        
        total_problems = sum(len(p) for s in result for p in [sub['problems'] for sub in s['subcategories']])
        print(f"Extracted {len(result)} sections, {total_problems} problems total")
        sys.exit(0)

print("Failed to extract data")
sys.exit(1)
