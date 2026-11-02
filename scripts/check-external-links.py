#!/usr/bin/env python3
"""Audit built-site HTTP(S) links. Nonzero exit means manual review is required.
A successful request is evidence for this environment only, not all visitors.
"""
import concurrent.futures, json, sys, urllib.request, urllib.error
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, urldefrag
class Links(HTMLParser):
    def __init__(self): super().__init__(); self.urls=[]
    def handle_starttag(self, tag, attrs):
        if tag=='a':
            href=dict(attrs).get('href','')
            if href.startswith(('https://','http://')): self.urls.append(urldefrag(href)[0])
refs={}
for p in Path('dist').rglob('*.html'):
    if 'preview' in p.parts: continue
    parser=Links(); parser.feed(p.read_text())
    for u in parser.urls:
        if urlsplit(u).hostname not in ('www.wisemainecoon.com','wisemainecoon.com'):
            refs.setdefault(u,[]).append(str(p.relative_to('dist')))
def check(item):
    url,pages=item
    result={'url':url,'pages':sorted(set(pages))}
    try:
        req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; WiseMaineCoon-LinkCheck/1.0)'})
        with urllib.request.urlopen(req,timeout=12) as r:
            body=r.read(8192).decode('utf-8','replace').lower()
            result.update(status=r.status,final_url=r.url)
            if any(x in body for x in ('the request could not be satisfied','access denied','just a moment...')):
                result['classification']='blocked_or_challenge'
            else: result['classification']='reachable_from_checker'
    except urllib.error.HTTPError as e:
        result.update(status=e.code,classification='broken' if e.code in (404,410) else 'blocked_or_review')
    except Exception as e:
        result.update(status=None,classification='inconclusive',error=str(e))
    return result
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
    results=list(pool.map(check,refs.items()))
report={'warning':'Reachability from checker does not guarantee visitor access. Review flagged URLs before deployment.','results':results}
Path('/tmp/wise-maine-coon-external-links.json').write_text(json.dumps(report,indent=2))
from collections import Counter
print(json.dumps({'unique_links':len(results),'classifications':dict(Counter(x['classification'] for x in results))}))
for r in results:
    if r['classification']!='reachable_from_checker': print(json.dumps(r))
sys.exit(any(r['classification']!='reachable_from_checker' for r in results))
