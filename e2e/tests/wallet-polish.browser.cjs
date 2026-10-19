const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const { mkdirSync } = require('node:fs');
(async () => {
 const server = require('node:child_process').spawn(process.execPath, [resolve(__dirname,'../../frontend/web/node_modules/next/dist/bin/next'),'start','--port','3101'], {cwd:resolve(__dirname,'../../frontend/web'),stdio:['ignore','pipe','pipe']});
 await new Promise((resolveReady,reject)=>{server.stdout.on('data',data=>{if(String(data).includes('Ready'))resolveReady();});server.once('exit',code=>reject(new Error('Server exited '+code)));});
 const browser = await chromium.launch({channel:'chrome',headless:true});
 const output=resolve(__dirname,'../test-results/wallet-polish'); mkdirSync(output,{recursive:true});
 try {
  for (const width of [1440,960,390,320]) {
   const page=await browser.newPage({viewport:{width,height:1000}});
   await page.route('**/api/**', async route => {
    const path=new URL(route.request().url()).pathname;
    const body=path==='/api/me'?{id:1,github_id:42,github_login:'dipesh-BS'}
     :path==='/api/me/points'?{total_points:5}
     :path==='/api/avax/config'?{testnet:true,symbol:'USDC'}
     :path==='/api/escrow/config'?{enabled:true,execution_mode:'sponsored'}
     :path==='/api/sponsored/wallet'?{address:'0x'+'11'.repeat(20),balance_units:'12500000',chain_id:43113}
     :path==='/api/sponsored/operations'?{items:[{id:1,bounty_id:7,kind:'fund',status:'verified',tx_hash:'0x'+'22'.repeat(32)},{id:2,bounty_id:9,kind:'settle',status:'submitted',tx_hash:null}]}
     :path==='/api/issues'?{items:[],has_more:false,page:1,per_page:25}
     :path==='/api/maintainer/repositories'?{items:[],total:0,page:1,per_page:30}
     :path==='/api/github-app'?{configured:false,repositories:[]}
     :{items:[]};
    await route.fulfill({json:body});
   });
   await page.goto('http://127.0.0.1:3101/explore');
   await page.getByText('No bounties have been published yet.').waitFor();
   await page.getByRole('button',{name:'Publish your first bounty'}).click();
   await page.getByText('Choose a repository',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Explore bounties',exact:true}).click();
   const publish=page.getByRole('button',{name:'Publish your first bounty'});
   assert.equal(await publish.evaluate(el=>{const s=getComputedStyle(el);return s.backgroundColor!==s.color&&el.getBoundingClientRect().height>=40}),true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`Explore overflow ${width}`);
   await page.screenshot({path:resolve(output,`explore-${width}.png`),fullPage:true});
   await page.getByRole('button',{name:'Payments',exact:true}).click();
   await page.getByRole('button',{name:'Copy deposit address'}).waitFor();
   assert.equal(await page.getByText('Connect & link wallet',{exact:true}).count(),0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`Payments overflow ${width}`);
   await page.locator('.wallet-menu > summary').click();
   await page.getByRole('link',{name:'View transaction ↗'}).first().waitFor();
   const box=await page.locator('.wallet-menu-panel').boundingBox();
   assert.ok(box.x>=0 && box.x+box.width<=width,`Dropdown fits ${width}`);
   await page.screenshot({path:resolve(output,`payments-${width}.png`),fullPage:true});
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('.wallet-menu').getAttribute('open'),null);
   await page.goto('http://127.0.0.1:3101/wallet');
   await page.getByRole('button',{name:'Copy deposit address'}).waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`Wallet overflow ${width}`);
   assert.equal(await page.locator('.mp-header .wallet-menu').isVisible(),true,`Wallet header visible ${width}`);
   await page.screenshot({path:resolve(output,`wallet-${width}.png`),fullPage:true});
   console.log(`Passed ${width}px: publish navigation, payment wallet, activity, escape and overflow`);
   await page.close();
  }
 } finally { await browser.close(); server.kill(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
