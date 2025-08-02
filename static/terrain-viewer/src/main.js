window.addEventListener("DOMContentLoaded", function () {
  const canvas = document.getElementById("renderCanvas");
  const engine = new BABYLON.Engine(canvas, true);
  const scene = new BABYLON.Scene(engine);

  const METERS_PER_PIXEL = 1.0; 

  scene.clearColor = new BABYLON.Color3(0.7, 0.85, 1.0);

  const camera = new BABYLON.ArcRotateCamera("camera", Math.PI / 2, Math.PI / 2.5, 150, BABYLON.Vector3.Zero(), scene);
  camera.attachControl(canvas, true);
  camera.minZ = 1;

  const light = new BABYLON.DirectionalLight("dirLight", new BABYLON.Vector3(-1, -2, -1), scene);
  light.position = new BABYLON.Vector3(100, 200, 100);
  light.intensity = 0.7;

  const hemiLight = new BABYLON.HemisphericLight("hemiLight", new BABYLON.Vector3(0, 1, 0), scene);
  hemiLight.intensity = 0.3;

  let ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 1, height: 1 }, scene);
  let groundMat = new BABYLON.StandardMaterial("groundMat", scene);
  groundMat.diffuseColor = new BABYLON.Color3(0.7, 0.7, 0.7);
  ground.material = groundMat;
  ground.receiveShadows = true;

  const slopeImage = new Image();
  slopeImage.src = "/processed/slope_map.png";
  const slopeCanvas = document.createElement("canvas");
  const slopeCtx = slopeCanvas.getContext("2d");
  let slopeImageLoaded = false;
  slopeImage.onload = () => {
    slopeCanvas.width = slopeImage.width;
    slopeCanvas.height = slopeImage.height;
    slopeCtx.drawImage(slopeImage, 0, 0);
    slopeImageLoaded = true;
    console.log("Slope map image loaded for hover lookup.");
  };

  const hazardImage = new Image();
  hazardImage.src = "/processed/hazard_map.png";
  const hazardCanvas = document.createElement("canvas");
  const hazardCtx = hazardCanvas.getContext("2d");
  let hazardImageLoaded = false;
  hazardImage.onload = () => {
    hazardCanvas.width = hazardImage.width;
    hazardCanvas.height = hazardImage.height;
    hazardCtx.drawImage(hazardImage, 0, 0);
    hazardImageLoaded = true;
    console.log("Hazard map image loaded for hover lookup.");
  };

  let terrain, defaultMaterial, slopeMaterial, hazardMaterial;
  let terrainMinX_world, terrainMaxX_world, terrainMinZ_world, terrainMaxZ_world;

  const landingZoneMeshes = [];

  let clickCount = 0;
  let firstPoint = null;
  let secondPoint = null;
  let lineMesh = null;
  let isDistanceToolActive = false;

  let isPathPlanningToolActive = false;
  let pathStartPointSphere = null;
  let pathEndPointSphere = null;
  let pathLineMesh = null;
  let pathClickCount = 0;
  let pathStartPixel = null;
  let pathEndPixel = null;

  const pathOptionsPanel = document.getElementById('path-options-panel');
  const maxSlopeRange = document.getElementById('max-slope-range');
  const maxSlopeValue = document.getElementById('max-slope-value');
  const maxSlopeInput = document.getElementById('max-slope-input');
  const recalculatePathButton = document.getElementById('recalculate-path-button');

  maxSlopeValue.textContent = `${maxSlopeRange.value}°`;
  maxSlopeInput.value = maxSlopeRange.value;

  let currentMaxSlope = parseFloat(maxSlopeRange.value);

  maxSlopeRange.addEventListener('input', () => {
      maxSlopeValue.textContent = `${maxSlopeRange.value}°`;
      maxSlopeInput.value = maxSlopeRange.value;
      currentMaxSlope = parseFloat(maxSlopeRange.value);
  });
  maxSlopeInput.addEventListener('change', () => {
      let val = parseFloat(maxSlopeInput.value);
      if (isNaN(val) || val < 0) val = 0;
      if (val > 90) val = 90;
      maxSlopeInput.value = val.toFixed(1);
      maxSlopeRange.value = val;
      maxSlopeValue.textContent = `${val}°`;
      currentMaxSlope = val;
  });


  BABYLON.SceneLoader.ImportMesh("", "/static/processed/", "lunar_terrain.obj", scene, function (meshes) {
    terrain = meshes[0];

    terrain.computeWorldMatrix(true);
    const initialBounds = terrain.getBoundingInfo().boundingBox;

    terrain.position.x = -initialBounds.center.x;
    terrain.position.z = -initialBounds.center.z;
    terrain.position.y = -initialBounds.minimum.y + 0.05;

    terrain.computeWorldMatrix(true); 
    const finalRenderedBounds = terrain.getBoundingInfo().boundingBox;

    terrainMinX_world = finalRenderedBounds.minimumWorld.x;
    terrainMaxX_world = finalRenderedBounds.maximumWorld.x;
    terrainMinZ_world = finalRenderedBounds.minimumWorld.z;
    terrainMaxZ_world = finalRenderedBounds.maximumWorld.z;

    const terrainWidth = terrainMaxX_world - terrainMinX_world;
    const terrainDepth = terrainMaxZ_world - terrainMinZ_world;

    if (ground) {
        ground.dispose();
    }
    ground = BABYLON.MeshBuilder.CreateGround("ground", {
      width: terrainWidth * 1.2,
      height: terrainDepth * 1.2
    }, scene);
    ground.material = groundMat;
    ground.position.x = finalRenderedBounds.centerWorld.x;
    ground.position.z = finalRenderedBounds.centerWorld.z;
    ground.position.y = finalRenderedBounds.minimumWorld.y - 0.1;


    defaultMaterial = new BABYLON.StandardMaterial("terrainMat", scene);
    if (typeof PROCESSED_IMAGE_URL !== 'undefined' && PROCESSED_IMAGE_URL !== '') {
        const terrainTexture = new BABYLON.Texture(PROCESSED_IMAGE_URL, scene);
        defaultMaterial.diffuseTexture = terrainTexture;
        defaultMaterial.specularColor = BABYLON.Color3.Black();
    } else {
        console.warn("PROCESSED_IMAGE_URL not found or is empty. Using default gray material.");
        defaultMaterial.diffuseColor = new BABYLON.Color3(0.5, 0.5, 0.5);
    }
    terrain.material = defaultMaterial;

    const slopeTexture = new BABYLON.Texture("/processed/slope_map.png", scene);
    slopeMaterial = new BABYLON.StandardMaterial("slopeMat", scene);
    slopeMaterial.diffuseTexture = slopeTexture;
    slopeMaterial.emissiveTexture = slopeTexture;
    slopeMaterial.specularColor = BABYLON.Color3.Black();

    const hazardTexture = new BABYLON.Texture("/processed/hazard_map.png", scene);
    hazardMaterial = new BABYLON.StandardMaterial("hazardMat", scene);
    hazardMaterial.diffuseTexture = hazardTexture;
    hazardMaterial.emissiveTexture = hazardTexture;
    hazardMaterial.specularColor = BABYLON.Color3.Black();

    camera.setTarget(terrain.position);
    camera.radius = Math.max(terrainWidth, terrainDepth) * 0.8;


    const landingZoneMaterial = new BABYLON.StandardMaterial("landingZoneMat", scene);
    landingZoneMaterial.diffuseColor = new BABYLON.Color3(0, 1, 0);
    landingZoneMaterial.alpha = 0.4;
    landingZoneMaterial.backFaceCulling = false;

    if (LANDING_ZONES_DATA && LANDING_ZONES_DATA.length > 0 && IMAGE_WIDTH > 0 && IMAGE_HEIGHT > 0) {
        LANDING_ZONES_DATA.forEach((zone, index) => {
            const [y_start_px, x_start_px, y_end_px, x_end_px] = zone.bbox;

            const worldStart = mapPixelToWorld_for_plane(x_start_px, y_start_px);
            const worldEnd = mapPixelToWorld_for_plane(x_end_px, y_end_px);
            const worldCenter = mapPixelToWorld_for_plane(zone.center_pixel[1], zone.center_pixel[0]);

            const zoneWidth = Math.abs(worldEnd.x - worldStart.x);
            const zoneDepth = Math.abs(worldEnd.z - worldStart.z);
            const zoneCenterX = worldCenter.x;
            const zoneCenterZ = worldCenter.z;

            const ray = new BABYLON.Ray(new BABYLON.Vector3(zoneCenterX, finalRenderedBounds.maximumWorld.y + 1000, zoneCenterZ), BABYLON.Vector3.Down());
            const pickInfo = scene.pickWithRay(ray, (mesh) => mesh === terrain);

            let zoneElevation = finalRenderedBounds.minimumWorld.y;
            if (pickInfo.hit && pickInfo.pickedPoint) {
                zoneElevation = pickInfo.pickedPoint.y;
            }

            const landingZonePlane = BABYLON.MeshBuilder.CreatePlane(`landingZone_${index}`, {width: zoneWidth, height: zoneDepth}, scene);
            landingZonePlane.material = landingZoneMaterial;
            landingZonePlane.rotation.x = Math.PI / 2;
            landingZonePlane.position = new BABYLON.Vector3(zoneCenterX, zoneElevation + 0.1, zoneCenterZ);

            landingZonePlane.isVisible = true;
            landingZonePlane.isPickable = true;
            landingZonePlane.name = `landingZone_${index}`;
            landingZoneMeshes.push(landingZonePlane);

            landingZonePlane.metadata = {
                zone_id: index,
                area_pixels: zone.area_pixels,
                center_pixel: zone.center_pixel,
                hazardStatus: "Safe"
            };
        });
        console.log(`Successfully visualized ${landingZoneMeshes.length} landing zones.`);
    } else {
        console.log("No landing zone data or IMAGE_WIDTH/HEIGHT are zero/invalid. Skipping landing zone visualization.");
    }
  });


  const viewLabel = document.getElementById("view-label");

  window.addEventListener("keydown", (e) => {
    if (!terrain) return;
    if (e.key === "s") {
      terrain.material = slopeMaterial;
      viewLabel.textContent = "View: Slope Map";
      landingZoneMeshes.forEach(m => m.isVisible = false);
      if (lineMesh) lineMesh.isVisible = false;
      if (pathLineMesh) pathLineMesh.isVisible = false;
      if (pathStartPointSphere) pathStartPointSphere.isVisible = false;
      if (pathEndPointSphere) pathEndPointSphere.isVisible = false;
      pathOptionsPanel.style.display = 'none';
    } else if (e.key === "h") {
      terrain.material = hazardMaterial;
      viewLabel.textContent = "View: Hazard Map";
      landingZoneMeshes.forEach(m => m.isVisible = false);
      if (lineMesh) lineMesh.isVisible = false;
      if (pathLineMesh) pathLineMesh.isVisible = false;
      if (pathStartPointSphere) pathStartPointSphere.isVisible = false;
      if (pathEndPointSphere) pathEndPointSphere.isVisible = false;
      pathOptionsPanel.style.display = 'none';
    } else if (e.key === "m") {
      terrain.material = defaultMaterial;
      viewLabel.textContent = "View: Normal (Textured)";
      landingZoneMeshes.forEach(m => m.isVisible = true);
      if (lineMesh) lineMesh.isVisible = true;
      if (pathLineMesh) pathLineMesh.isVisible = true;
      if (pathStartPointSphere) pathStartPointSphere.isVisible = true;
      if (pathEndPointSphere) pathEndPointSphere.isVisible = true;
    } else if (e.key === "r") {
      if (terrain) {
          camera.setTarget(terrain.position);
          camera.radius = Math.max(terrainWidth, terrainDepth) * 0.8;
      } else {
          camera.setPosition(new BABYLON.Vector3(0, 100, -150));
          camera.setTarget(BABYLON.Vector3.Zero());
      }
    }
  });

  const infoBox = document.getElementById("info-box");

  scene.onPointerMove = function (evt) {
    if (isDistanceToolActive || isPathPlanningToolActive) return;

    const pickResult = scene.pick(scene.pointerX, scene.pointerY);

    if (pickResult && pickResult.hit && pickResult.pickedMesh === terrain && slopeImageLoaded && hazardImageLoaded) {
      const point = pickResult.pickedPoint;
      const x_display = point.x.toFixed(2);
      const y_display = point.y.toFixed(2);
      const z_display = point.z.toFixed(2);


      const pixelX_lookup = Math.floor(((point.x - terrainMinX_world) / (terrainMaxX_world - terrainMinX_world)) * (IMAGE_WIDTH - 1));
      const pixelY_lookup = Math.floor(((point.z - terrainMinZ_world) / (terrainMaxZ_world - terrainMinZ_world)) * (IMAGE_HEIGHT - 1));

      const clampedPixelX = Math.max(0, Math.min(pixelX_lookup, IMAGE_WIDTH - 1));
      const clampedPixelY = Math.max(0, Math.min(pixelY_lookup, IMAGE_HEIGHT - 1));

      let slopeText = "N/A";
      if (clampedPixelX >= 0 && clampedPixelX < slopeCanvas.width && clampedPixelY >= 0 && clampedPixelY < slopeCanvas.height) {
        try {
          const pixel = slopeCtx.getImageData(clampedPixelX, clampedPixelY, 1, 1).data[0];
          const angle = (pixel / 255) * 90; // Now correctly scaled by app.py to represent 0-90
          slopeText = `${angle.toFixed(2)}°`; 
        } catch (err) {
          console.warn("Slope pixel lookup error:", err);
        }
      }

      let hazardStatus = "N/A";
      let hazardColor = "white";
      if (clampedPixelX >= 0 && clampedPixelX < hazardCanvas.width && clampedPixelY >= 0 && clampedPixelY < hazardCanvas.height) {
        try {
          const pixel = hazardCtx.getImageData(clampedPixelX, clampedPixelY, 1, 1).data;
          const r = pixel[0];
          const g = pixel[1];
          const b = pixel[2];

          if (g > 200 && r < 50 && b < 50) {
              hazardStatus = "Safe"; hazardColor = "#00FF00";
          } else if (r > 200 && g > 200 && b < 50) {
              hazardStatus = "Moderate"; hazardColor = "#FFFF00";
          } else if (r > 200 && g < 50 && b < 50) {
              hazardStatus = "Critical"; hazardColor = "#FF0000";
          } else {
              hazardStatus = "Undetermined"; hazardColor = "#AAAAAA";
          }
        } catch (err) {
          console.warn("Hazard pixel lookup error:", err);
        }
      }

      infoBox.innerHTML = `
        <strong>Terrain Coordinates</strong><br>
        X: ${x_display} units<br>
        Elevation (Y): ${y_display} units<br>
        Z: ${z_display} units<br>
        <span style="color:#ccc;">Slope Angle:</span> ${slopeText}<br>
        <span style="color:#ccc;">Hazard Status:</span> <span style="color:${hazardColor}; font-weight: bold;">${hazardStatus}</span>
      `;
    } else {
      infoBox.innerHTML = "<em>Hover over terrain to see elevation</em>";
    }
  };


  document.getElementById("download-select").addEventListener("change", (e) => {
    const value = e.target.value;

    if (value === "screenshot") {
      BABYLON.Tools.CreateScreenshotUsingRenderTarget(engine, camera, { width: 1280, height: 720 }, (data) => {
        const a = document.createElement('a');
        a.href = data;
        a.download = "terrain_view.png";
        a.click();
      });
    } else if (value) {
      const a = document.createElement('a');
      a.href = value;
      a.download = value.split("/").pop();
      a.click();
    }

    e.target.selectedIndex = 0;
  });

  const distanceToolButton = document.createElement("button");
  distanceToolButton.textContent = "Activate Distance Tool";
  distanceToolButton.style.position = "absolute";
  distanceToolButton.style.bottom = "50px";
  distanceToolButton.style.right = "10px";
  distanceToolButton.style.padding = "10px 15px";
  distanceToolButton.style.background = "#007bff";
  distanceToolButton.style.color = "white";
  distanceToolButton.style.border = "none";
  distanceToolButton.style.borderRadius = "5px";
  distanceToolButton.style.cursor = "pointer";
  distanceToolButton.style.zIndex = "1000";
  document.body.appendChild(distanceToolButton);

  function resetDistanceTool() {
    clickCount = 0;
    firstPoint = null;
    secondPoint = null;
    if (lineMesh) {
      lineMesh.dispose();
      lineMesh = null;
    }
    infoBox.innerHTML = "<em>Hover over terrain to see elevation</em>";
    isDistanceToolActive = false;
    distanceToolButton.textContent = "Activate Distance Tool";
    distanceToolButton.style.background = "#007bff";
    camera.attachControl(canvas, true);
    canvas.oncontextmenu = null; // Re-enable context menu/right-click pan
  }

  distanceToolButton.addEventListener('click', () => {
    if (isPathPlanningToolActive) {
        alert("Please deactivate Path Planning Tool first.");
        return;
    }
    if (isDistanceToolActive) {
        resetDistanceTool();
    } else {
        isDistanceToolActive = true;
        distanceToolButton.textContent = "Deactivate Distance Tool";
        distanceToolButton.style.background = "#dc3545";
        infoBox.innerHTML = "<strong>Distance Tool:</strong> Click first point on terrain.";
        camera.detachControl(canvas);
        canvas.oncontextmenu = (e) => e.preventDefault();
        resetPathPlanningTool();
    }
  });


  const pathPlanningToolButton = document.createElement("button");
  pathPlanningToolButton.textContent = "Activate Path Planning Tool";
  pathPlanningToolButton.style.position = "absolute";
  pathPlanningToolButton.style.bottom = "90px";
  pathPlanningToolButton.style.right = "10px";
  pathPlanningToolButton.style.padding = "10px 15px";
  pathPlanningToolButton.style.background = "#28a745";
  pathPlanningToolButton.style.color = "white";
  pathPlanningToolButton.style.border = "none";
  pathPlanningToolButton.style.borderRadius = "5px";
  pathPlanningToolButton.style.cursor = "pointer";
  pathPlanningToolButton.style.zIndex = "1000";
  document.body.appendChild(pathPlanningToolButton);

  function resetPathPlanningTool() {
      pathClickCount = 0;
      pathStartPixel = null;
      pathEndPixel = null;
      if (pathLineMesh) {
          pathLineMesh.dispose();
          pathLineMesh = null;
      }
      if (pathStartPointSphere) {
          pathStartPointSphere.dispose();
          pathStartPointSphere = null;
      }
      if (pathEndPointSphere) {
          pathEndPointSphere.dispose();
          pathEndPointSphere = null;
      }
      infoBox.innerHTML = "<em>Hover over terrain to see elevation</em>";
      isPathPlanningToolActive = false;
      pathPlanningToolButton.textContent = "Activate Path Planning Tool";
      pathPlanningToolButton.style.background = "#28a745";
      camera.attachControl(canvas, true);
      canvas.oncontextmenu = null;
      pathOptionsPanel.style.display = 'none';
  }

  pathPlanningToolButton.addEventListener('click', () => {
    if (isDistanceToolActive) {
        alert("Please deactivate Distance Tool first.");
        return;
    }
    if (isPathPlanningToolActive) {
        resetPathPlanningTool();
    } else {
        isPathPlanningToolActive = true;
        pathPlanningToolButton.textContent = "Deactivate Path Planning Tool";
        pathPlanningToolButton.style.background = "#dc3545";
        infoBox.innerHTML = "<strong>Path Planning Tool:</strong> Click start point on terrain.";
        camera.detachControl(canvas);
        canvas.oncontextmenu = (e) => e.preventDefault();
        resetDistanceTool();
        pathOptionsPanel.style.display = 'block';
    }
  });


  // --- Unified Click Listener for Tools ---
  canvas.addEventListener('click', async function(evt) {
    if (!terrain) {
      console.warn("Terrain not loaded yet. Please wait.");
      return;
    }
    const pickResult = scene.pick(scene.pointerX, scene.pointerY);

    if (pickResult.hit && pickResult.pickedMesh === terrain) {
      const pickedPoint = pickResult.pickedPoint.clone();

      // --- Distance Tool Logic ---
      if (isDistanceToolActive) {
        if (clickCount === 0) {
          firstPoint = pickedPoint;
          clickCount = 1;
          infoBox.innerHTML = `<strong>Distance Tool:</strong> First point set at X:${firstPoint.x.toFixed(2)} units Y:${firstPoint.y.toFixed(2)} units Z:${firstPoint.z.toFixed(2)} units.<br>Click second point on terrain.`;
          console.log("Distance tool: First point:", firstPoint);

        } else if (clickCount === 1) {
          secondPoint = pickedPoint;
          const distance = BABYLON.Vector3.Distance(firstPoint, secondPoint);

          let totalSlope = 0;
          let sampleCount = 0;
          const numSamples = 20;

          for (let i = 0; i <= numSamples; i++) {
              const interpolatedPoint = BABYLON.Vector3.Lerp(firstPoint, secondPoint, i / numSamples);
              const pixelX_lookup = Math.floor(((interpolatedPoint.x - terrainMinX_world) / (terrainMaxX_world - terrainMinX_world)) * (IMAGE_WIDTH - 1));
              const pixelY_lookup = Math.floor(((interpolatedPoint.z - terrainMinZ_world) / (terrainMaxZ_world - terrainMinZ_world)) * (IMAGE_HEIGHT - 1));
              const clampedPixelX = Math.max(0, Math.min(pixelX_lookup, IMAGE_WIDTH - 1));
              const clampedPixelY = Math.max(0, Math.min(pixelY_lookup, IMAGE_HEIGHT - 1));

              if (slopeImageLoaded && clampedPixelX >= 0 && clampedPixelX < slopeCanvas.width && clampedPixelY >= 0 && clampedPixelY < slopeCanvas.height) {
                  try {
                      const pixel = slopeCtx.getImageData(clampedPixelX, clampedPixelY, 1, 1).data[0];
                      const angle = (pixel / 255) * 90; // Now correctly scaled by app.py
                      totalSlope += angle;
                      sampleCount++;
                  } catch (err) { /* console.warn */ }
              }
          }
          const averageSlope = sampleCount > 0 ? (totalSlope / sampleCount) : 0;

          if (lineMesh) lineMesh.dispose();
          lineMesh = BABYLON.MeshBuilder.CreateLines("measurementLine", { points: [firstPoint, secondPoint], updatable: true }, scene);
          lineMesh.color = new BABYLON.Color3(1, 0, 0);

          infoBox.innerHTML = `
            <strong>Distance Tool:</strong><br>
            P1: X:${firstPoint.x.toFixed(2)} units Y:${firstPoint.y.toFixed(2)} units Z:${firstPoint.z.toFixed(2)} units<br>
            P2: X:${secondPoint.x.toFixed(2)} units Y:${secondPoint.y.toFixed(2)} units Z:${secondPoint.z.toFixed(2)} units<br>
            Distance: ${distance.toFixed(2)} units<br>
            Average Slope: ${averageSlope.toFixed(2)}°
            <br><span style="color:#ccc; font-size:0.8em;">Click again to start new measurement or deactivate.</span>
            `;
          clickCount = 0;
        }
      } 
      // --- Path Planning Tool Logic ---
      else if (isPathPlanningToolActive) {
        if (pathClickCount === 0) {
            pathStartPixel = mapWorldToPixel(pickedPoint);
            if (pathStartPointSphere) pathStartPointSphere.dispose();
            pathStartPointSphere = BABYLON.MeshBuilder.CreateSphere("startSphere", {diameter: 5}, scene);
            pathStartPointSphere.position = pickedPoint;
            pathStartPointSphere.material = new BABYLON.StandardMaterial("startMat", scene);
            pathStartPointSphere.material.diffuseColor = new BABYLON.Color3(0, 1, 1);
            
            pathClickCount = 1;
            infoBox.innerHTML = `<strong>Path Planning Tool:</strong> Start point set at X:${pickedPoint.x.toFixed(2)} units Y:${pickedPoint.y.toFixed(2)} units Z:${pickedPoint.z.toFixed(2)} units.<br>Click end point on terrain.`;
            console.log("Path planning: Start point:", pathStartPixel);

        } else if (pathClickCount === 1) {
            pathEndPixel = mapWorldToPixel(pickedPoint);
            if (pathEndPointSphere) pathEndPointSphere.dispose();
            pathEndPointSphere = BABYLON.MeshBuilder.CreateSphere("endSphere", {diameter: 5}, scene);
            pathEndPointSphere.position = pickedPoint;
            pathEndPointSphere.material = new BABYLON.StandardMaterial("endMat", scene);
            pathEndPointSphere.material.diffuseColor = new BABYLON.Color3(1, 0.5, 0);
            
            pathClickCount = 2;
            infoBox.innerHTML = `<strong>Path Planning Tool:</strong> End point set at X:${pickedPoint.x.toFixed(2)} units Y:${pickedPoint.y.toFixed(2)} units Z:${pickedPoint.z.toFixed(2)} units.<br>Calculating path...`;
            console.log("Path planning: End point:", pathEndPixel);

            await calculateAndDisplayPath(pathStartPixel, pathEndPixel);
        }
      }
    } else {
        if (isDistanceToolActive || isPathPlanningToolActive) {
            resetAllTools();
            infoBox.innerHTML = "<em>Hover over terrain to see elevation</em><br><strong>Tool Reset:</strong> Clicked outside terrain.";
        }
    }
  });

  async function calculateAndDisplayPath(startPixel, endPixel) {
      if (!startPixel || !endPixel || !terrain) return;

      try {
          const response = await fetch('/find_rover_path', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                  start_pixel: [startPixel.x, startPixel.y],
                  end_pixel: [endPixel.x, endPixel.y],
                  max_slope: currentMaxSlope
              })
          });

          if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
          }

          const result = await response.json();

          if (result.path && result.path.length > 0) {
              const pathPoints3D = [];
              for (const pixelCoords of result.path) {
                  const worldPos = mapPixelToWorld(pixelCoords[0], pixelCoords[1]);
                  const ray = new BABYLON.Ray(new BABYLON.Vector3(worldPos.x, terrain.getBoundingInfo().boundingBox.maximumWorld.y + 1000, worldPos.z), BABYLON.Vector3.Down());
                  const pickInfo = scene.pickWithRay(ray, (mesh) => mesh === terrain);
                  if (pickInfo.hit && pickInfo.pickedPoint) {
                      pathPoints3D.push(pickInfo.pickedPoint.clone());
                  } else {
                      pathPoints3D.push(new BABYLON.Vector3(worldPos.x, terrain.position.y, worldPos.z));
                  }
              }

              if (pathLineMesh) pathLineMesh.dispose();
              const pathDistance3D = BABYLON.Vector3.Distance(pathPoints3D[0], pathPoints3D[pathPoints3D.length - 1]);

              pathLineMesh = BABYLON.MeshBuilder.CreateLines("roverPath", { points: pathPoints3D, updatable: true }, scene);
              pathLineMesh.color = new BABYLON.Color3(0, 1, 0);

              infoBox.innerHTML = `<strong>Path Planning Tool:</strong> Path found with ${result.path.length} steps.<br>Total Distance: ${pathDistance3D.toFixed(2)} units.`;
              console.log("Path visualized:", pathPoints3D);
          } else {
              infoBox.innerHTML = `<strong>Path Planning Tool:</strong> ${result.message || "No path found."}`;
              if (pathLineMesh) pathLineMesh.dispose();
          }

      } catch (error) {
          console.error("Error finding path:", error);
          infoBox.innerHTML = `<strong>Path Planning Tool:</strong> Error calculating path: ${error.message}.`;
          if (pathLineMesh) pathLineMesh.dispose();
      }
  }


  function resetAllTools() {
      clickCount = 0;
      firstPoint = null;
      secondPoint = null;
      if (lineMesh) {
          lineMesh.dispose();
          lineMesh = null;
      }
      isDistanceToolActive = false;
      distanceToolButton.textContent = "Activate Distance Tool";
      distanceToolButton.style.background = "#007bff";

      pathClickCount = 0;
      pathStartPixel = null;
      pathEndPixel = null;
      if (pathLineMesh) {
          pathLineMesh.dispose();
          pathLineMesh = null;
      }
      if (pathStartPointSphere) {
          pathStartPointSphere.dispose();
          pathStartPointSphere = null;
      }
      if (pathEndPointSphere) {
          pathEndPointSphere.dispose();
          pathEndPointSphere = null;
      }
      isPathPlanningToolActive = false;
      pathPlanningToolButton.textContent = "Activate Path Planning Tool";
      pathPlanningToolButton.style.background = "#28a745";
      pathOptionsPanel.style.display = 'none';

      camera.attachControl(canvas, true);
      canvas.oncontextmenu = null;
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        resetAllTools();
        console.log("All tools reset via Escape key.");
    } else if (e.key === 'd' && isDistanceToolActive) {
        resetDistanceTool();
        console.log("Distance tool reset via 'd' key.");
    } else if (e.key === 'p' && isPathPlanningToolActive) {
        resetPathPlanningTool();
        console.log("Path planning tool reset via 'p' key.");
    }
  });


  document.getElementById("download-select").addEventListener("change", (e) => {
    const value = e.target.value;

    if (value === "screenshot") {
      BABYLON.Tools.CreateScreenshotUsingRenderTarget(engine, camera, { width: 1280, height: 720 }, (data) => {
        const a = document.createElement('a');
        a.href = data;
        a.download = "terrain_view.png";
        a.click();
      });
    } else if (value) {
      const a = document.createElement('a');
      a.href = value;
      a.download = value.split("/").pop();
      a.click();
    }

    e.target.selectedIndex = 0;
  });

  let xrHelper = null;
  const vrButton = document.createElement("button");
  vrButton.textContent = "Enter VR";
  vrButton.style.position = "absolute";
  vrButton.style.bottom = "10px";
  vrButton.style.right = "10px";
  vrButton.style.padding = "10px 20px";
  vrButton.style.background = "#8a2be2";
  vrButton.style.color = "white";
  vrButton.style.border = "none";
  vrButton.style.borderRadius = "5px";
  vrButton.style.cursor = "pointer";
  vrButton.style.zIndex = "1000";
  document.body.appendChild(vrButton);
vrButton.addEventListener("click", async () => {
    if (!scene.isReady()) {
        alert("Scene is not ready. Please wait for terrain to load.");
        return;
    }

    if (!navigator.xr) {
        alert("WebXR is not supported in this browser or device.");
        return;
    }

    const isSupported = await navigator.xr.isSessionSupported("immersive-vr");
    if (!isSupported) {
        alert("Immersive VR not supported (check your browser or headset).");
        return;
    }

    try {
        if (!xrHelper) {
            // Make sure terrain and ground are defined
            const floorMeshes = [];
            if (typeof ground !== 'undefined') floorMeshes.push(ground);
            if (typeof terrain !== 'undefined') floorMeshes.push(terrain);

            xrHelper = await scene.createDefaultXRExperienceAsync({
                floorMeshes: floorMeshes
            });

            xrHelper.pointerSelection.displayLaserPointer = true;
            xrHelper.pointerSelection.displayGazeInteraction = true;

            xrHelper.baseExperience.onStateChangedObservable.add((state) => {
                if (state === BABYLON.XRState.ENTERING_XR) {
                    console.log("Entering VR mode...");
                    const xrCam = scene.activeCamera;
                    if (xrCam && terrain) {
                        const minY = terrain.getBoundingInfo().boundingBox.minimumWorld.y;
                        xrCam.position.set(terrain.position.x, minY + 2, terrain.position.z);
                    }
                    camera.detachControl(canvas);
                } else if (state === BABYLON.XRState.EXITING_XR) {
                    console.log("Exiting VR mode...");
                    camera.setPosition(new BABYLON.Vector3(0, 100, -150));
                    camera.setTarget(terrain.position);
                    camera.attachControl(canvas, true);
                }
            });
        }

        // Explicitly enter XR
        await xrHelper.baseExperience.enterXRAsync("immersive-vr", "local-floor");

    } catch (error) {
        console.error("XR Error:", error);
        alert(`Failed to start VR: ${error.message || "Unknown error"}`);
    }
});

  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());

  function mapWorldToPixel(worldPoint) {
      const pixelX = Math.floor(((worldPoint.x - terrainMinX_world) / (terrainMaxX_world - terrainMinX_world)) * (IMAGE_WIDTH - 1));
      const pixelY = Math.floor(((worldPoint.z - terrainMinZ_world) / (terrainMaxZ_world - terrainMinZ_world)) * (IMAGE_HEIGHT - 1));
      return { x: pixelX, y: pixelY };
  }

  function mapPixelToWorld_for_plane(pixelX, pixelY) {
      const u = pixelX / (IMAGE_WIDTH - 1);
      const v = pixelY / (IMAGE_HEIGHT - 1);
      const worldX = terrainMinX_world + u * (terrainMaxX_world - terrainMinX_world);
      const worldZ = terrainMinZ_world + v * (terrainMaxZ_world - terrainMinZ_world);
      return new BABYLON.Vector3(worldX, 0, worldZ);
  }

  function mapPixelToWorld(pixelX, pixelY) {
      return mapPixelToWorld_for_plane(pixelX, pixelY);
  }
});