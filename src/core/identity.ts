// Anonymous identity (research R7): nickname and avatar are derived from the device key, so the client cannot choose them
// and a reconnect gets the same ones. 80 × 80 names keep 1,000 visitors at about 925 distinct nicknames.

export const ADJECTIVES = [
  '느긋한', '용감한', '귀여운', '똑똑한', '수줍은', '명랑한', '졸린', '배고픈', '신나는', '조용한',
  '씩씩한', '다정한', '엉뚱한', '부지런한', '상냥한', '날쌘', '포근한', '반짝이는', '행복한', '즐거운',
  '차분한', '친절한', '재빠른', '느린', '꼼꼼한', '대담한', '소심한', '쾌활한', '늠름한', '온화한',
  '유쾌한', '순한', '활발한', '우아한', '겸손한', '성실한', '침착한', '듬직한', '말랑한', '폭신한',
  '동글동글한', '산뜻한', '싱그러운', '향긋한', '달콤한', '상큼한', '새침한', '의젓한', '당당한', '똘똘한',
  '영리한', '순수한', '해맑은', '수다스러운', '노래하는', '춤추는', '웃는', '꿈꾸는', '산책하는', '여행하는',
  '낮잠자는', '책읽는', '휘파람부는', '뒹구는', '깡총거리는', '빛나는', '푸른', '붉은', '노란', '하얀',
  '작은', '커다란', '둥근', '따뜻한', '시원한', '보송한', '멋진', '근사한', '고요한', '재치있는',
];

export const ANIMALS = [
  '고양이', '강아지', '수달', '너구리', '여우', '토끼', '다람쥐', '고슴도치', '판다', '코알라',
  '펭귄', '부엉이', '올빼미', '참새', '까치', '비둘기', '오리', '거위', '백조', '두루미',
  '독수리', '앵무새', '공작', '플라밍고', '펠리컨', '갈매기', '제비', '꾀꼬리', '사자', '호랑이',
  '표범', '치타', '늑대', '곰', '북극곰', '사슴', '노루', '기린', '얼룩말', '코끼리',
  '하마', '코뿔소', '낙타', '알파카', '캥거루', '원숭이', '고릴라', '나무늘보', '돌고래', '고래',
  '물개', '해달', '바다사자', '거북이', '악어', '도마뱀', '카멜레온', '이구아나', '개구리', '두꺼비',
  '햄스터', '친칠라', '족제비', '오소리', '미어캣', '염소', '양', '당나귀', '병아리', '칠면조',
  '문어', '해파리', '불가사리', '꽃게', '새우', '나비', '꿀벌', '무당벌레', '반딧불이', '달팽이',
];

export const AVATAR_IDS = ['char-01', 'char-02', 'char-03', 'char-04', 'char-05', 'char-06', 'char-07', 'char-08'];

// FNV-1a with a murmur3 finalizer: synchronous, dependency-free and well spread for UUID input.
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export function nicknameFor(deviceKey: string): string {
  const h = hash(`nickname|${deviceKey}`);
  return `${ADJECTIVES[h % ADJECTIVES.length]} ${ANIMALS[Math.floor(h / ADJECTIVES.length) % ANIMALS.length]}`;
}

export const avatarFor = (deviceKey: string): string => AVATAR_IDS[hash(`avatar|${deviceKey}`) % AVATAR_IDS.length];
