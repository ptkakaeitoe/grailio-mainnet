import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialDemo, buyDemoPacks, openDemoPack, drawRarity, actOnDemoCard, pendingDemoReward, demoStakingNow, startDemoStaking, keptAfter, DEMO_STAKING_SEED, DEMO_OTHER_WEIGHT, seedDemoListings, buyDemoListing, listDemoCard, cancelDemoListing } from '../lib/demo-economy.ts';
const tier={id:2,price:10,odds:[60,25,12,3],backing:[2,6,28,101.33]};
const DAY=86400000;
const near=(a,b,eps=1e-9)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);

test('quotes stock purchases and stores the purchased tier for every pack',()=>{
 const state=initialDemo();state.balances.WBNB=1;
 const next=buyDemoPacks(state,tier,2,'WBNB',200);
 assert.equal(next.balances.WBNB,.9);assert.deepEqual(next.packs,[2,2]);
 assert.equal(buyDemoPacks(state,tier,1,'BNB',10),null);
 assert.equal(buyDemoPacks(state,tier,1,'WBNB',0),null);
 assert.equal(buyDemoPacks(state,tier,11,'USDT',1),null);
});
test('rarity selection follows cumulative tier odds including exact boundaries',()=>{
 assert.deepEqual([0,.59999,.6,.84999,.85,.96999,.97,.99999].map(r=>drawRarity(tier.odds,r)),[0,0,1,1,2,2,3,3]);
});
test('opens the saved tier, selects any stock, fixes backing at opening, and rejects repeat redemption',()=>{
 const purchased=buyDemoPacks(initialDemo(),tier,1,'USDT',1);
 const tickers=['BTC','ETH','WBNB','LINK','CAKE'];const prices=Object.fromEntries(tickers.map(t=>[t,100]));
 assert.equal(openDemoPack(purchased,tier,tickers,{},0,.99),null);
 const opened=openDemoPack(purchased,tier,tickers,prices,.3,.99);
 assert.equal(opened.card.ticker,'ETH');assert.equal(opened.card.rarity,3);assert.equal(opened.card.amount,1.0133);
 assert.equal(opened.state.packs.length,0);assert.equal(openDemoPack(opened.state,tier,tickers,prices,0,0),null);
 const redeemed=actOnDemoCard(opened.state,opened.card.id,'redeem',0);
 assert.equal(redeemed.balances.ETH,1.0133);assert.equal(actOnDemoCard(redeemed,opened.card.id,'redeem',0),null);
 // The burned card leaves the collection but stays in redeemed, for the profile.
 assert.equal(redeemed.cards.length,0);assert.deepEqual(redeemed.redeemed.map(c=>c.id),[opened.card.id]);
});
test('staking pays a revenue pool with a 7-day half-life, split by weight',()=>{
 near(keptAfter(7*DAY),.5);near(keptAfter(14*DAY),.25);near(keptAfter(0),1);
 const purchased=buyDemoPacks(initialDemo(),tier,1,'USDT',1);
 const opened=openDemoPack(purchased,tier,['WBNB'],{WBNB:100},0,.99);// Legendary: weight 10
 const staked=actOnDemoCard(opened.state,1,'stake',0);
 assert.equal(actOnDemoCard(staked,1,'redeem',1000),null);
 assert.equal(actOnDemoCard(staked,1,'stake',1000),null);
 // After 7 days half the pool is paid out; the card gets 10 of 210 weight.
 const share=10/(DEMO_OTHER_WEIGHT+10);
 near(pendingDemoReward(staked,staked.cards[0],7*DAY),DEMO_STAKING_SEED/2*share);
 const claimed=actOnDemoCard(staked,1,'claim',7*DAY);
 near(claimed.balances.USDT,4990+DEMO_STAKING_SEED/2*share);
 assert.equal(pendingDemoReward(claimed,claimed.cards[0],7*DAY),0);
 // The next 7 days pay half of what is left: payouts slow down.
 const unstaked=actOnDemoCard(claimed,1,'unstake',14*DAY);
 near(unstaked.balances.USDT,4990+DEMO_STAKING_SEED*3/4*share);
 assert.equal(unstaked.cards[0].stakedAt,null);assert.equal(unstaked.cards[0].debt,undefined);
 assert.ok(actOnDemoCard(unstaked,1,'redeem',14*DAY));
 // Daily payout is the pool times (1 - 2^(-1/7)), and yours is your weight's share.
 const now=demoStakingNow(staked,0);
 near(now.total,DEMO_STAKING_SEED*(1-keptAfter(DAY)));near(now.yours,now.total*share);
});
test('an older save with a staked card and no pool starts earning when loaded',()=>{
 const old={...initialDemo(),cards:[{id:1,ticker:'BTC',tier:0,rarity:0,amount:1,stakedAt:0}]};
 const started=startDemoStaking(old,DAY);
 assert.equal(started.staking.pool,DEMO_STAKING_SEED);assert.equal(started.cards[0].debt,0);
 assert.ok(pendingDemoReward(started,started.cards[0],2*DAY)>0);
 assert.equal(startDemoStaking(started,5*DAY),started);
});
test('opened packs add their profit to the staking pool from now on',()=>{
 const t={id:1,price:1,odds:[50,25,20,5],backing:[.46,.8,1.4,4]};
 const bought=buyDemoPacks(initialDemo(),t,1,'USDT',1);
 const opened=openDemoPack(bought,t,['BTC'],{BTC:1},0,0,0);// Common: $0.54 profit, half to stakers
 near(opened.state.staking.pool,DEMO_STAKING_SEED+.27);
 const loss=openDemoPack(buyDemoPacks(initialDemo(),t,1,'USDT',1),t,['BTC'],{BTC:1},0,.99,0);
 assert.equal(loss.state.staking,undefined);
});

test('every $1 tier costs 1 USDT and averages $0.91 of tokens (9% edge)',()=>{
 const tiers=[
  {id:0,price:1,odds:[50,25,20,5],backing:[0.82,0.9,1.04,1.34]},
  {id:1,price:1,odds:[50,25,20,5],backing:[0.46,0.8,1.4,4]},
  {id:2,price:1,odds:[60,25,12,3],backing:[0.2,0.6,2.8,10.13]},
 ];
 for(const t of tiers){
  assert.equal(t.odds.reduce((a,b)=>a+b,0),100);
  const ev=t.odds.reduce((sum,o,i)=>sum+o/100*t.backing[i],0);
  assert.ok(Math.abs(ev-0.91)<0.0005,`tier ${t.id} averages ${ev}`);
  const bought=buyDemoPacks(initialDemo(),t,1,'USDT',1);
  assert.equal(initialDemo().balances.USDT-bought.balances.USDT,1);
  const top=openDemoPack(bought,t,['BTC'],{BTC:60000},0,.99);
  assert.equal(top.card.rarity,3);assert.ok(Math.abs(top.card.amount*60000-t.backing[3])<1e-9);
 }
});
test('demo market: seeds once, buys with the listing currency, lists, cancels and sells minus the fee',()=>{
 const tickers=['AAPL','MSFT'];const prices={AAPL:200,MSFT:400};
 let r=0;const random=()=>{r=(r+.37)%1;return r;};
 assert.equal(seedDemoListings(initialDemo(),tickers,{AAPL:200},30,random,0),null);
 const seeded=seedDemoListings(initialDemo(),tickers,prices,30,random,0);
 assert.equal(seeded.listings.length,8);assert.equal(seedDemoListings(seeded,tickers,prices,30,random,0),null);
 assert.ok(seeded.listings.every(l=>l.seller!=='you'&&l.price>0&&tickers.includes(l.card.ticker)));
 const l=seeded.listings[0];
 const bought=buyDemoListing(seeded,l.id);
 assert.equal(bought.cards.length,1);assert.equal(bought.listings.length,7);
 assert.ok(Math.abs(bought.balances[l.currency]-(seeded.balances[l.currency]-l.price))<1e-9);
 const poor={...seeded,balances:{...seeded.balances,[l.currency]:0}};
 assert.equal(buyDemoListing(poor,l.id),null);
 const card=bought.cards[0];
 const listed=listDemoCard(bought,card.id,5,'BNB',7,0);
 assert.equal(listed.cards.length,0);assert.equal(listed.listings.at(-1).seller,'you');
 assert.equal(listDemoCard(bought,card.id,0,'USDT',7,0),null);
 const mine=listed.listings.at(-1);
 assert.equal(buyDemoListing(listed,mine.id),null);
 assert.equal(cancelDemoListing(listed,mine.id).cards.length,1);
 assert.equal(cancelDemoListing(listed,l.id+1),null);
 assert.equal(listDemoCard(bought,card.id,0.123456,'BNB',7,0).listings.at(-1).price,0.1235);
 assert.ok(seeded.listings.every(l=>l.price===Number(l.price.toFixed(l.currency==='BNB'?4:2))));
});
