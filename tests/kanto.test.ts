import { expect, it } from 'vitest';
import { serviceFeeds, KANTO_FEEDS, MAX_ONLINE_FEEDS } from '../server/settings';
import { mergeFeeds } from '../src/transit/feeds';
import { data } from './fixtures';
it('関東プリセットは検証済み鉄道だけを含み、重複を除く', () => {
  expect(serviceFeeds('toei,kanto,auth-TokyoMetro')).toEqual(KANTO_FEEDS);
  expect(KANTO_FEEDS).toHaveLength(10);
  expect(KANTO_FEEDS).toEqual(expect.arrayContaining(['toei','auth-TokyoMetro','auth-Keio','auth-Tobu','auth-YokohamaMunicipal']));
  expect(KANTO_FEEDS).not.toContain('tosaden');
  expect(KANTO_FEEDS).not.toContain('auth-Seibu');
  expect(()=>serviceFeeds('unverified-provider')).toThrow();
});
it('配布元数を増やしても端末の既定上限と総便数制限を維持', () => {
  const feeds=Array.from({length:9},(_,i)=>({feedId:`test-${i}`,data:data(),checkedAt:Date.now()}));
  expect(()=>mergeFeeds(feeds)).toThrow('1〜8');
  expect(mergeFeeds(feeds,[],MAX_ONLINE_FEEDS).feeds).toHaveLength(9);
  const huge={...data(),trips:Array.from({length:40001},(_,i)=>({...data().trips[0],id:String(i)}))};
  expect(()=>mergeFeeds([{feedId:'oversized',data:huge,checkedAt:0}],[],MAX_ONLINE_FEEDS)).toThrow('検索上限');
});
