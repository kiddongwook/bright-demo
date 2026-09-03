/** 서브 경로 배포(/bright-demo/pwa/)에서도 깨지지 않는 정적 자산 경로. asset('logo/x.png') */
export const asset = (p: string) => `${import.meta.env.BASE_URL}${p.replace(/^\//, '')}`;
