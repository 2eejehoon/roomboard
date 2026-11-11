# 3D 에셋 출처

모든 파일은 CC0 1.0 (퍼블릭 도메인, https://creativecommons.org/publicdomain/zero/1.0/)이다(헌법 제품·품질 제약, research R13).
`bash scripts/fetch-assets.sh`가 아래 원본을 내려받아 이 폴더를 다시 만든다. 가공 방법은 그 스크립트에 있다.

## Quaternius — Ultimate Animated Character Pack

- 팩 페이지: https://quaternius.com/packs/ultimatedanimatedcharacter.html (페이지의 Download가 아래 Drive 폴더로 연결)
- 원본: https://drive.google.com/drive/folders/1sNi1AfenfPRrvRt5yfaj5QMMd6KKcUJ5 의 `glTF/`, 라이선스: 같은 폴더의 `License.txt` (CC0 1.0)
- 가공: Idle·Walk·Run·Jump 애니메이션만 남기고 GLB로 묶은 뒤 meshopt 압축

| 파일 | 원본 |
|---|---|
| `characters/char-01.glb` | `Casual_Male.gltf` |
| `characters/char-02.glb` | `Casual_Female.gltf` |
| `characters/char-03.glb` | `Casual2_Male.gltf` |
| `characters/char-04.glb` | `Casual2_Female.gltf` |
| `characters/char-05.glb` | `Casual3_Male.gltf` |
| `characters/char-06.glb` | `Casual3_Female.gltf` |
| `characters/char-07.glb` | `Chef_Male.gltf` |
| `characters/char-08.glb` | `Suit_Female.gltf` |

## Quaternius — Sushi Restaurant Kit (카페 테마 가구)

- 팩 페이지: https://quaternius.com/packs/sushirestaurantkit.html (페이지의 라이선스 표기 CC0, CC0 1.0 증서 링크. Drive 폴더에는 License.txt가 없다)
- 원본: https://drive.google.com/drive/folders/1srOaThdSqYBtmrqq9couZShM5r0cw_bH 의 `Environment/glTF/`, `Decoration/glTF/`
- 가공: GLB로 묶고 meshopt 압축

| 파일 | 원본 |
|---|---|
| `models/counter.glb` | `Environment/glTF/Environment_Counter_Straight.gltf` |
| `models/table-round.glb` | `Environment/glTF/Environment_Table.gltf` |
| `models/chair.glb` | `Environment/glTF/Environment_Chair2.gltf` |
| `models/plant.glb` | `Decoration/glTF/Decoration_Plant2.gltf` |

## Quaternius — 도서관·정원 가구 (OBJ 팩)

아래 네 팩은 Drive에 OBJ + MTL만 있다(텍스처 없음, 단색 재질). 각 폴더의 `License.txt`는 CC0 1.0이다.
가공: `scripts/obj-to-glb.ts`로 GLB를 만들고(재질마다 `Kd` 색 하나), gltf-transform weld 뒤 meshopt 압축.
크기는 `src/core/themes.ts`의 `scale`로 맞춘다.

| 파일 | 팩(페이지) | 원본 |
|---|---|---|
| `models/bookshelf.glb` | Ultimate Furniture (https://quaternius.com/packs/ultimatefurniture.html, Drive `1n85oUi0RN5ZUXEIMKA-AnBsPErVXWcma`) | `OBJ/Bookcase_Books.obj` |
| `models/desk.glb` | Ultimate Furniture | `OBJ/Desk.obj` |
| `models/sofa.glb` | Ultimate Furniture | `OBJ/Sofa.obj` |
| `models/lamp.glb` | Ultimate Home Interior (https://quaternius.com/packs/ultimatehomeinterior.html, Drive `1SNK9PwPi8xqqxmpU5xEZeiQjB26C1oX6`) | `OBJ/Light_Floor1.obj` |
| `models/well.glb` | Medieval Village (https://quaternius.com/packs/medievalvillage.html, Drive `18T92VcNldHG0ugWo1u0hSJGDLua-n7o5`) | `Props/OBJ/Well.obj` |
| `models/bench.glb` | Medieval Village | `Props/OBJ/Bench_1.obj` |
| `models/tree.glb` | Ultimate Nature (https://quaternius.com/packs/ultimatenature.html, Drive `1-Kl0L_Jg8awbh0S5T-z3zxh4mVlnxTpa`) | `OBJ/CommonTree_1.obj` |
| `models/flowers.glb` | Ultimate Nature | `OBJ/Flowers.obj` |

## 테마 미리보기

`previews/<테마>.jpg`는 위 에셋으로 그린 우리 3D 방을 `scripts/theme-previews.ts`로 찍은 것이다(새 출처 없음).
렌더는 기계마다 조금씩 달라 `scripts/assets.sha256`에 넣지 않는다. 테마나 에셋이 바뀌면 다시 찍는다.

## 용량 (테마별 첫 로딩)

캐릭터는 방에 있는 아바타만 받는다(하나 약 0.13~0.2MB, 8개 1.3MB). 가구는 카페 43KB, 도서관 0.17MB, 정원 0.08MB.
조명 환경은 파일을 받지 않는다(003 research R1, 2026-11-11에 Poly Haven HDRI 테마당 1.6~1.8MB를 뺐다).
3D 코드 청크(three, R3F, Rapier WASM)는 별도로 gzip 약 1.2MB다.
