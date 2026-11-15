import json,hashlib,urllib.request,concurrent.futures,pathlib,time
root=pathlib.Path(__file__).resolve().parent.parent
source=json.loads((root/'public/assets/catalog-source.json').read_text())['catalog']
ranges={'Common':(5,15),'Uncommon':(16,40),'Rare':(41,90),'Epic':(91,200),'Legendary':(201,600),'Arcane':(601,2500),'Nameless':(2501,10000)}
assets={}; catalog=[]
for s in source:
 url=s.get('imageUrlWebp') or s['image']; key=hashlib.sha256(url.encode()).hexdigest()[:20]; ext='.webp' if '.webp' in url else '.png';path='/assets/skins/'+key+ext
 assets[url]=(root/'public'/path.lstrip('/'),s['image'])
 lo,hi=ranges[s['rarity']]; fraction=int(hashlib.sha256(s['id'].encode()).hexdigest()[:8],16)/0xffffffff
 catalog.append({'id':s['id'],'name':s['name']+(' · StatTrack' if s.get('isStatTrak') else '')+(' · Souvenir' if s.get('isSouvenir') else ''),'weapon':s['weapon'],'rarity':s['rarity'],'price_minor':round(lo+(hi-lo)*fraction)*100,'image':path})
(root/'src/api/catalog-data.json').write_text(json.dumps(catalog,ensure_ascii=False))
(root/'public/assets/catalog-source.json').write_text(json.dumps({'source':'https://standoffcraft.com/api/skins','retrieved_at':'2026-11-15','records':len(source),'catalog':source},ensure_ascii=False))
(root/'public/assets/skins').mkdir(exist_ok=True)
def download(pair):
 url,(path,fallback)=pair
 if path.exists():return None
 for attempt in range(3):
  try:
   req=urllib.request.Request(url if attempt<2 else fallback,headers={'User-Agent':'Mozilla/5.0'})
   with urllib.request.urlopen(req,timeout=25) as r:
    data=r.read()
    if not r.headers.get('Content-Type','').startswith('image/'):raise ValueError('Not image')
    path.write_bytes(data)
   return None
  except Exception as e: error=str(e)
 return {'url':url,'error':error}
failed=[];count=0
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
 for result in ex.map(download,assets.items()):
  count+=1
  if result:failed.append(result)
  if count%200==0:print('Downloaded',count,'/',len(assets),flush=True)
(root/'public/assets/download-report.json').write_text(json.dumps({'total_records':len(source),'unique_images':len(assets),'failed':failed},ensure_ascii=False,indent=2))
print('Complete:',len(assets)-len(failed),'images;',len(failed),'failed',flush=True)
