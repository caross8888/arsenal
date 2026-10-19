import assert from 'node:assert/strict';
import sample from '../arsenal-dashboard/public/career/relationship-sample/sample.js';

const {eligibleEvents}=sample;
const senior={senior:true,official:true,appearances:1};
assert.deepEqual(eligibleEvents(senior,{}),['debut'],'첫 1군 공식 출전');
assert.deepEqual(eligibleEvents({...senior,senior:false},{}),[],'유스 제외');
assert.deepEqual(eligibleEvents({...senior,official:false},{}),[],'친선경기 제외');
assert.deepEqual(eligibleEvents({...senior,appearances:0},{}),[],'벤치 대기 제외');
assert.deepEqual(eligibleEvents(senior,{debut:true}),[],'데뷔 이벤트 반복 제외');
const transfer={transferCompleted:true,fromCountry:'KOR',toCountry:'ENG',partner:true};
assert.deepEqual(eligibleEvents(transfer,{}),['foreign'],'완료한 해외 이적');
assert.deepEqual(eligibleEvents({...transfer,transferCompleted:false},{}),[],'제안만 도착');
assert.deepEqual(eligibleEvents({...transfer,toCountry:'KOR'},{}),[],'국내 이적');
assert.deepEqual(eligibleEvents({...transfer,partner:false},{}),[],'연인 없는 경우');
assert.deepEqual(eligibleEvents({...transfer,fromCountry:null},{}),[],'이적 전 국가 불명');
console.log('관계 샘플 사건 조건 10개 통과');
