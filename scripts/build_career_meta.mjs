// 로컬 유스가 API 없이 시작할 수 있게 화면용 고정 자료를 정적으로 저장한다.
import {writeFileSync} from 'node:fs';
import handler from '../arsenal-dashboard/api/career.js';
await handler({query:{a:'meta'},headers:{},method:'GET'},{setHeader(){},json(meta){writeFileSync(new URL('../arsenal-dashboard/public/career/sim-v1/meta.json',import.meta.url),JSON.stringify(meta)+'\n');}});
