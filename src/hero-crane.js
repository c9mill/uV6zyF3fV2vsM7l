import * as THREE from 'three';
import { MTLLoader } from './vendor/three/MTLLoader.js';
import { OBJLoader } from './vendor/three/OBJLoader.js';

const canvas = document.querySelector('.hero-crane-canvas');
const visual = canvas?.closest('.hero-visual');
if (canvas && visual && 'WebGLRenderingContext' in window) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: true, powerPreference: 'low-power'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-4.5, 4.5, 4.5, -4.5, 0.1, 100);
  camera.position.set(0.8, 3.8, 18);
  camera.lookAt(0.8, 3.8, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x354866, 2.2));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
  keyLight.position.set(-4, 9, 8);
  scene.add(keyLight);

  const craneRoot = new THREE.Group();
  craneRoot.position.x = 0.45;
  scene.add(craneRoot);
  const upper = new THREE.Group();
  const mast = new THREE.Group();
  craneRoot.add(mast, upper);

  const pivotHeight = 4.9;
  const attachX = 3.8;
  const attachY = 1.85;
  const ropeLength = 1.55;
  const photoWidth = 1.32;
  const photoHeight = 1.4;
  const photoCenterY = attachY - ropeLength - photoHeight / 2;
  const photoCenterZ = 1.25;
  const ropePoints = new Float32Array(6);
  const ropeGeometry = new THREE.BufferGeometry();
  ropeGeometry.setAttribute('position', new THREE.BufferAttribute(ropePoints, 3));
  const rope = new THREE.Line(ropeGeometry, new THREE.LineBasicMaterial({color: 0xf0d17b, transparent: true, opacity: 0.95}));
  upper.add(rope);

  const cargo = new THREE.Group();
  cargo.position.set(attachX, photoCenterY, photoCenterZ);
  const picture = new THREE.Mesh(new THREE.PlaneGeometry(photoWidth, photoHeight), new THREE.MeshBasicMaterial({transparent: true, side: THREE.DoubleSide}));
  picture.userData.draggable = true;
  cargo.add(picture);
  upper.add(cargo);

  const physics = {angle: 0, angularVelocity: 0, yaw: 0, yawVelocity: 0, tug: 0, dragging: false, lastX: 0, pointerId: null};
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let visible = false;
  let lastFrame = 0;
  let animationId = 0;

  function resize() {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    renderer.setSize(width, height, false);
    const aspect = width / height;
    const viewHeight = Math.max(8.6, 8.0 / aspect * 1.08);
    camera.left = -viewHeight * aspect / 2;
    camera.right = viewHeight * aspect / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }
  new ResizeObserver(resize).observe(visual);

  function splitCrane(object) {
    object.updateMatrixWorld(true);
    object.traverse(source => {
      if (!source.isMesh) return;
      const sourcePosition = source.geometry.getAttribute('position');
      if (!sourcePosition) return;
      const sourceIndex = source.geometry.getIndex();
      const attributes = Object.entries(source.geometry.attributes);
      const parts = [Object.fromEntries(attributes.map(([name]) => [name, []])), Object.fromEntries(attributes.map(([name]) => [name, []]))];
      const count = sourceIndex ? sourceIndex.count : sourcePosition.count;
      for (let face = 0; face + 2 < count; face += 3) {
        const ids = [0, 1, 2].map(corner => sourceIndex ? sourceIndex.getX(face + corner) : face + corner);
        const y = ids.reduce((sum, id) => sum + sourcePosition.getY(id), 0) / 3;
        const part = y >= pivotHeight ? 1 : 0;
        for (const id of ids) {
          for (const [name, attribute] of attributes) {
            for (let component = 0; component < attribute.itemSize; component++) {
              let value = attribute.array[id * attribute.itemSize + component];
              if (part && name === 'position' && component === 1) value -= pivotHeight;
              parts[part][name].push(value);
            }
          }
        }
      }
      for (let part = 0; part < parts.length; part++) {
        if (!parts[part].position.length) continue;
        const geometry = new THREE.BufferGeometry();
        for (const [name, attribute] of attributes) {
          geometry.setAttribute(name, new THREE.Float32BufferAttribute(parts[part][name], attribute.itemSize));
        }
        geometry.computeBoundingSphere();
        const material = Array.isArray(source.material) ? source.material[0] : source.material;
        const mesh = new THREE.Mesh(geometry, material);
        (part ? upper : mast).add(mesh);
      }
      source.geometry.dispose();
    });
    upper.position.y = pivotHeight;
    craneRoot.position.y = 0;
  }

  function updateRope() {
    const swing = ropeLength * Math.sin(physics.angle);
    const photoX = attachX + swing;
    const photoY = attachY - ropeLength * Math.cos(physics.angle);
    cargo.position.set(photoX, photoY - photoHeight / 2, photoCenterZ);
    cargo.rotation.set(0, -physics.yaw, Math.sin(physics.angle) * 0.14);
    const position = rope.geometry.getAttribute('position');
    position.setXYZ(0, attachX, attachY, photoCenterZ);
    position.setXYZ(1, photoX, photoY + photoHeight / 2, photoCenterZ);
    position.needsUpdate = true;
    upper.rotation.y = physics.yaw;
  }

  function animate(time) {
    animationId = 0;
    const dt = Math.min(0.04, Math.max(0.001, (time - (lastFrame || time)) / 1000));
    lastFrame = time;
    if (!physics.dragging) {
      const damping = reducedMotion.matches ? 1.35 : 0.48;
      const yawDamping = reducedMotion.matches ? 1.6 : 0.62;
      physics.angularVelocity += (-9.81 / ropeLength * Math.sin(physics.angle) - damping * physics.angularVelocity) * dt;
      physics.angle += physics.angularVelocity * dt;
      physics.yawVelocity += (-1.45 * physics.yaw - yawDamping * physics.yawVelocity + physics.angle * 0.6) * dt;
      physics.yaw += physics.yawVelocity * dt;
    }
    updateRope();
    renderer.render(scene, camera);
    const moving = Math.abs(physics.angle) > 0.0008 || Math.abs(physics.angularVelocity) > 0.002 || Math.abs(physics.yaw) > 0.0008 || Math.abs(physics.yawVelocity) > 0.002;
    if (visible && (physics.dragging || moving)) animationId = requestAnimationFrame(animate);
  }

  function start() {
    if (visible && !animationId) animationId = requestAnimationFrame(animate);
  }
  new IntersectionObserver(entries => {
    visible = entries.some(entry => entry.isIntersecting);
    if (visible) start();
    else { cancelAnimationFrame(animationId); animationId = 0; }
  }, {rootMargin: '80px'}).observe(visual);

  function hitPhoto(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height * 2 - 1));
    raycaster.setFromCamera(pointer, camera);
    upper.updateMatrixWorld(true);
    return raycaster.intersectObject(picture, false).length > 0;
  }
  canvas.addEventListener('pointerdown', event => {
    if (!hitPhoto(event)) return;
    event.preventDefault();
    physics.dragging = true;
    physics.pointerId = event.pointerId;
    physics.lastX = event.clientX;
    physics.angularVelocity = 0;
    physics.yawVelocity = 0;
    canvas.classList.add('is-hauling');
    canvas.setPointerCapture(event.pointerId);
    start();
  });
  canvas.addEventListener('pointermove', event => {
    if (!physics.dragging || event.pointerId !== physics.pointerId) {
      canvas.style.cursor = hitPhoto(event) ? 'grab' : 'default';
      return;
    }
    const dx = event.clientX - physics.lastX;
    physics.lastX = event.clientX;
    physics.angle = THREE.MathUtils.clamp(physics.angle - dx * 0.006, -0.68, 0.68);
    physics.angularVelocity = -dx * 0.014;
    physics.yaw = THREE.MathUtils.clamp(physics.yaw + dx * 0.003, -0.75, 0.75);
    physics.yawVelocity = dx * 0.008;
    updateRope();
  });
  function release(event) {
    if (!physics.dragging || (event && event.pointerId !== physics.pointerId)) return;
    physics.dragging = false;
    physics.pointerId = null;
    canvas.classList.remove('is-hauling');
    start();
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', release);
  canvas.addEventListener('keydown', event => {
    const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    if (!direction) return;
    event.preventDefault();
    physics.angularVelocity += direction * 1.7;
    physics.yawVelocity -= direction * 0.65;
    start();
  });

  const textureLoader = new THREE.TextureLoader();
  textureLoader.load('/assets/campus.webp', texture => {
    texture.colorSpace = THREE.SRGBColorSpace;
    picture.material.map = texture;
    picture.material.needsUpdate = true;
  });
  const materialsLoader = new MTLLoader();
  materialsLoader.load('/assets/hero-crane/tower_crane.mtl', materials => {
    materials.preload();
    new OBJLoader().setMaterials(materials).load('/assets/hero-crane/tower_crane.obj', object => {
      splitCrane(object);
      updateRope();
      resize();
      start();
    });
  });
  resize();
}
