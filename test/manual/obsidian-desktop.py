import asyncio,json,pathlib,subprocess,os
from playwright.async_api import async_playwright
BASE=pathlib.Path(os.environ['SUO_OBSIDIAN_TEST_DIR']); ROOT=BASE/'vault'; RESULTS=[]
def log(name,detail):
 RESULTS.append({'test':name,'detail':detail}); (BASE/'results.json').write_text(json.dumps(RESULTS,indent=2)); print(name, json.dumps(detail),flush=True)
def cli(*args,ok=True):
 r=subprocess.run(['node',str(pathlib.Path(__file__).resolve().parents[2]/'dist/cli.js'),*args,'--root',str(ROOT)],capture_output=True,text=True)
 if ok and r.returncode: raise RuntimeError(r.stderr)
 if not ok:
  assert r.returncode, r.stdout
  return r.stderr.strip()
 return json.loads(r.stdout)
async def main():
 async with async_playwright() as p:
  b=await p.chromium.connect_over_cdp(os.environ.get('SUO_OBSIDIAN_CDP','http://127.0.0.1:9222')); page=b.contexts[0].pages[0]
  page.set_default_timeout(15000)
  await page.wait_for_function('typeof app !== "undefined" && app.metadataCache.initialized')
  await page.evaluate('app.workspace.openLinkText("Projects/Gallery.md","",false)')
  await page.locator('[data-property-key="suo_dependencies"] .internal-link').click()
  await page.wait_for_function('app.workspace.getActiveFile()?.path === "Projects/Portal.md"')
  backlinks=await page.evaluate('Array.from(app.metadataCache.getBacklinksForFile(app.workspace.getActiveFile()).data.keys())')
  assert 'Projects/Gallery.md' in backlinks
  await page.evaluate('app.commands.executeCommandById("backlink:open")')
  await page.screenshot(path=str(BASE/'01-backlinks.png'))
  log('Property link click and native backlinks',backlinks)
  await page.evaluate('app.commands.executeCommandById("graph:open")')
  await page.wait_for_function('app.workspace.getLeavesOfType("graph").length>0')
  await page.wait_for_function('document.querySelector("canvas") !== null')
  graph=await page.evaluate('''(()=>{const v=app.workspace.getLeavesOfType('graph')[0].view; return {viewType:v.getViewType(),rendererKeys:Object.keys(v.renderer||{}),nodes:Object.keys(v.renderer?.nodes||{})}})()''')
  await page.screenshot(path=str(BASE/'02-graph.png'))
  log('Native graph view',graph)
  await page.evaluate('app.workspace.openLinkText("Projects/Gallery.md","",false)')
  title=page.locator('[data-property-key="suo_title"] [contenteditable="true"]')
  await title.fill('Gallery edited in Obsidian'); await title.press('Tab')
  await page.wait_for_function('app.metadataCache.getFileCache(app.vault.getAbstractFileByPath("Projects/Gallery.md"))?.frontmatter.suo_title === "Gallery edited in Obsidian"')
  diff=cli('vault','diff'); assert diff['changed']
  assert any(m['title']=='Gallery edited in Obsidian' for m in diff['after']['modules'])
  cli('vault','approve','--digest',diff['digest'],'--yes')
  log('Native Properties UI edit → Suo review/approval',{'changed':diff['changed'],'revision':cli('inspect')['revision']})
  await page.evaluate('app.fileManager.renameFile(app.vault.getAbstractFileByPath("Projects/Portal.md"),"Projects/Client Portal.md")')
  await page.wait_for_function('app.metadataCache.resolvedLinks["Projects/Gallery.md"]?.["Projects/Client Portal.md"]===2')
  diff=cli('vault','diff'); assert not diff['changed']
  log('Obsidian rename keeps ID and repairs typed links',{'changed':diff['changed'],'dependency':await page.evaluate('app.metadataCache.getFileCache(app.vault.getAbstractFileByPath("Projects/Gallery.md"))?.frontmatter?.suo_dependencies')})
  await page.evaluate('async()=>{await app.vault.createFolder("Research")}')
  await page.evaluate('app.fileManager.renameFile(app.vault.getAbstractFileByPath("Projects/Gallery.md"),"Research/Gallery.md")')
  await page.wait_for_function('app.metadataCache.resolvedLinks["Research/Gallery.md"]?.["Projects/Client Portal.md"]===2')
  diff=cli('vault','diff'); assert not diff['changed']
  log('Obsidian move across folders preserves relationships',{'changed':diff['changed'],'dependency':await page.evaluate('app.metadataCache.getFileCache(app.vault.getAbstractFileByPath("Research/Gallery.md"))?.frontmatter?.suo_dependencies')})
  await page.evaluate('app.workspace.openLinkText("Research/Gallery.md","",false)')
  await page.evaluate(r'''(()=>{const e=app.workspace.activeLeaf.view.editor; e.setValue(e.getValue().replace('<!-- suo:content -->\n\n','<!-- suo:content -->\nWritten inside the real Obsidian editor.\n'))})()''')
  await page.wait_for_function('app.vault.cachedRead(app.vault.getAbstractFileByPath("Research/Gallery.md")).then(t=>t.includes("Written inside the real Obsidian editor."))')
  await page.wait_for_function("path=>require('fs').readFileSync(path,'utf8').includes('Written inside the real Obsidian editor.')", arg=str(ROOT/'Research/Gallery.md'))
  diff=cli('vault','diff'); assert diff['changed']; old=diff['digest']
  await title.fill('Concurrent edit in Obsidian'); await title.press('Tab')
  await page.wait_for_function('app.metadataCache.getFileCache(app.vault.getAbstractFileByPath("Research/Gallery.md"))?.frontmatter?.suo_title === "Concurrent edit in Obsidian"')
  error=cli('vault','approve','--digest',old,'--yes',ok=False); assert 'stale' in error
  diff=cli('vault','diff'); cli('vault','approve','--digest',diff['digest'],'--yes')
  log('Editor content and stale review detection',{'staleError':error})
  fixture=json.loads((BASE/'fixture.json').read_text())
  proposal={'kind':'proposal','id':'proposal:external-refresh','summary':'Verify external file refresh','operations':[{'type':'update_module','moduleId':fixture['gallery'],'patch':{'title':'Updated by Suo while Obsidian is open','contract':{'objective':'Updated by the external Suo process.','frozenBehavior':['Private viewing'],'scope':['Gallery'],'nonGoals':['Public browsing'],'acceptance':[{'id':'view','text':'The customer can view photos.'}]}}}]}
  (BASE/'proposal.json').write_text(json.dumps(proposal))
  cli('submit',str(BASE/'proposal.json')); cli('approve',proposal['id'],'--yes')
  await page.wait_for_function('app.metadataCache.getFileCache(app.vault.getAbstractFileByPath("Research/Gallery.md"))?.frontmatter?.suo_title === "Updated by Suo while Obsidian is open"')
  await page.wait_for_function('app.workspace.activeLeaf.view.editor.getValue().includes("Updated by the external Suo process.")')
  await page.screenshot(path=str(BASE/'03-updated-properties.png'))
  log('External Suo write refreshes real open editor',{'title':await title.inner_text(),'acceptanceUI':await page.locator('[data-property-key="suo_acceptance"]').inner_text()})
  assert not cli('vault','diff')['changed']; assert cli('check')['valid']
  log('Final round-trip validation',{'valid':True})
asyncio.run(main())
