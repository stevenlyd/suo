import asyncio,json,pathlib,subprocess,os
from playwright.async_api import async_playwright
B=pathlib.Path(os.environ['SUO_OBSIDIAN_TEST_DIR']); R=B/'vault'
def cli(*args):
 r=subprocess.run(['node',str(pathlib.Path(__file__).resolve().parents[2]/'dist/cli.js'),*args,'--root',str(R)],capture_output=True,text=True,check=True);return json.loads(r.stdout)
async def main():
 async with async_playwright() as p:
  b=await p.chromium.connect_over_cdp(os.environ.get('SUO_OBSIDIAN_CDP','http://127.0.0.1:9222'));page=b.contexts[0].pages[0]
  await page.evaluate('app.workspace.openLinkText("Research/Gallery.md","",false)')
  await page.locator('[data-property-key="suo_phase"] [contenteditable="true"]').fill('release-two')
  await page.locator('[data-property-key="suo_phase"] [contenteditable="true"]').press('Tab')
  await page.wait_for_function('app.metadataCache.getFileCache(app.vault.getAbstractFileByPath("Research/Gallery.md"))?.frontmatter?.suo_phase === "release-two"')
  d=cli('vault','diff');g=next(m for m in d['after']['modules'] if m['title']=='Updated by Suo while Obsidian is open')
  assert g['contract']['acceptance']==[{'id':'view','text':'The customer can view photos.'}]
  cli('vault','approve','--digest',d['digest'],'--yes')
  await page.evaluate(r'''()=>{let e=app.workspace.activeLeaf.view.editor;e.setValue(e.getValue().replace(/Ordinary note link:.*\n/,'Ordinary prose remains personal.\n'))}''')
  await page.wait_for_function('app.metadataCache.resolvedLinks["Research/Gallery.md"]?.["Projects/Client Portal.md"]===1')
  assert not cli('vault','diff')['changed']
  back=await page.evaluate('Array.from(app.metadataCache.getBacklinksForFile(app.vault.getAbstractFileByPath("Projects/Client Portal.md")).data.entries())')
  assert back[0][1][0]['key']=='suo_dependencies.0'
  await page.evaluate('app.commands.executeCommandById("graph:open")')
  await page.wait_for_function('app.workspace.getLeavesOfType("graph")[0]?.view.renderer?.links?.length>0')
  graph=await page.evaluate('''()=>{let r=app.workspace.getLeavesOfType('graph')[0].view.renderer;return {nodes:r.nodes.map(n=>({id:n.id,type:n.type})),links:r.links.map(l=>({source:l.source?.id,target:l.target?.id,keys:Object.keys(l)}))}}''')
  # Allow the native force-layout animation to settle before capturing evidence.
  await page.wait_for_timeout(3000)
  await page.screenshot(path=str(B/'04-property-only-graph.png'))
  await page.evaluate('app.workspace.openLinkText("Projects/Client Portal.md","",false)')
  await page.evaluate('app.commands.executeCommandById("backlink:open")')
  await page.wait_for_function('document.body.innerText.includes("Gallery")')
  await page.screenshot(path=str(B/'05-property-only-backlinks.png'))
  result={'nestedAcceptancePreservedAfterNativePropertyEdit':True,'ordinaryProseRequiresNoApproval':True,'propertyOnlyBacklinks':back,'graph':graph}
  (B/'extra-results.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
asyncio.run(main())
