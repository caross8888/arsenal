// 확정 전·기존 토큰은 원래 시드. 확정 후 미래 사건만 서버 시드로 계산한다.
// 0도 유효한 시드이므로 || 로 대체하지 않는다.
export const eventSeed = C => C.seed2 ?? C.seed;
