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

## Poly Haven — HDRI

| 파일 | 원본 |
|---|---|
| `hdri/cafe.hdr` | "Comfy Café" (Sergej Majboroda), https://polyhaven.com/a/comfy_cafe, 1k HDR. 라이선스: CC0 (https://polyhaven.com/license) |

## 용량 (카페 테마 첫 로딩)

캐릭터 8개 1.3MB(방에 있는 아바타만 받는다), 가구 43KB, HDRI 1.6MB — 합계 약 2.9MB로 목표 5MB 이하.
3D 코드 청크(three, R3F, Rapier WASM)는 별도로 gzip 약 1.2MB다.
