# 極火蝦 (Red Cherry Shrimp) - 寫實 3D 水族模型資產

## 基本資訊
- **學名**：*Neocaridina davidi* (Bouvier, 1904)
- **水域**：淡水 (Freshwater)
- **資產編號**：`antigravity-v1-red-cherry-shrimp`
- **版本**：v1.0.0
- **格式**：glTF 2.0 Binary (`.glb`)

---

## 交付檔案清單
1. `model-lod0.glb`：LOD0 高精度寫實模型（3,472 三角面，3,204 頂點，嵌入 1024x1024 PBR 貼圖，1.15 MB）。
2. `model-lod1.glb`：LOD1 遠景最佳化模型（2,576 三角面，2,511 頂點，相同骨架與動作，1.11 MB）。
3. `red-cherry-shrimp.blend`：Blender 4.0.2 原始專案工程檔。
4. `manifest.json`：完整中繼資料、包圍盒數值、節點清單與動畫參數。
5. `preview-front.png`：正面視角（朝向 +X 頭部）。
6. `preview-side.png`：側面完整體態與步足接觸視角。
7. `preview-back.png`：背面視角（尾扇與腹節）。
8. `preview-top.png`：俯瞰視角（背甲、觸鬚展開與對稱性）。
9. `turntable.mp4`：360 度環繞算繪展示影片。
10. `README.md`：本技術說明文件。
11. `LICENSES.md`：授權條款聲明文件（CC0 1.0）。

---

## 座標系相容性規範
- **前進方向（頭部）**：`+X`
- **垂直向上（背部）**：`+Y`
- **體寬左右對稱**：沿 `Z` 軸
- **地面接觸基準面**：`Y = 0.00`（所有行走步足均精確著地，無埋入底砂或懸空）
- **根節點 Transform**：Position `[0, 0, 0]`，Rotation `[0, 0, 0]`，Scale `[1, 1, 1]`
- **Root Motion**：完全無根節點位移，所有位移路徑交由主程式／物理引擎控制。

---

## 動畫動作清單 (Animation Clips)
所有動畫均透過 glTF NLA Tracks 獨立匯出：
1. **`Idle`**（長度 3.0s，90 幀，循環）：鰓蓋呼吸節律、長鬚水流感知微幅晃動、腹足自然飄動。
2. **`Forage`**（長度 2.5s，75 幀，循環）：頭部微向前傾，左右螯足（Chelae）交替於底砂點擊採食。
3. **`Crawl`**（長度 1.6s，48 幀，循環）：三對步足採後行波 (Metachronal) 原地步態循環。
4. **`Swim`**（長度 1.2s，36 幀，循環）：身體仰角微升，五對腹足同步向後划水，步足向後貼合流線型。
5. **`Escape`**（長度 1.4s，42 幀，單次觸發）：典型的真蝦逃逸彈尾反射（Caridoid escape reflex），腹部與尾扇猛烈向內曲折後復原。

---

## Three.js 載入範例 (Codex 整合指南)

```typescript
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';

const loader = new GLTFLoader();

// 載入極火蝦資產
loader.load('/assets/models/antigravity-v1/red-cherry-shrimp/model-lod0.glb', (gltf) => {
  const shrimp = gltf.scene;
  
  // 陰影設定
  shrimp.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  // 動畫混音器
  const mixer = new THREE.AnimationMixer(shrimp);
  const idleAction = mixer.clipAction(
    THREE.AnimationClip.findByName(gltf.animations, 'Idle')
  );
  idleAction.play();

  // 加入場景（此時頭部朝向 +X，步足接觸 Y=0）
  scene.add(shrimp);
});
```

---

## 授權與相容性
- **授權**：CC0 1.0 Universal（公有領域貢獻，完全開源自由商用）。
- **依賴套件**：純標準 glTF 2.0，不使用 Draco、Meshopt 或 KTX2，任何標準 WebGL / Three.js 載入器皆可直讀。
