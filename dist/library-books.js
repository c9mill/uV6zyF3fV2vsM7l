import * as THREE from 'three';
import { MTLLoader } from './vendor/three/MTLLoader.js';
import { OBJLoader } from './vendor/three/OBJLoader.js';

const canvases = [...document.querySelectorAll('.library-book-orbit canvas[data-book-model]')];
if (canvases.length && 'WebGLRenderingContext' in window) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const instances = [];
  const basePath = '/assets/library/models/';

  for (const canvas of canvases) {
    const kind = canvas.dataset.bookModel;
    const path = `${basePath}${kind}/`;
    try {
      const renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: true, powerPreference: 'low-power'});
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setClearColor(0x000000, 0);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(34, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
      camera.position.set(0, 0, 5.6);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x243c26, 2.25));
      const key = new THREE.DirectionalLight(0xffffff, 3.1);
      key.position.set(-3, 4, 5);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0x83e7a5, 1.1);
      fill.position.set(4, 1, -3);
      scene.add(fill);

      const group = new THREE.Group();
      scene.add(group);
      const initial = {
        open_book: [0.95, -0.48, 0.12],
        enchanted_book: [-0.3, 0.55, -0.1],
        closed_book: [-0.25, 0.45, 0.08],
      }[kind];
      group.rotation.set(...initial);

      const instance = {canvas, renderer, scene, camera, group, ready: false, visible: false,
        floatPhase: Math.random() * Math.PI * 2, baseX: initial[0], baseY: initial[1],
        dragging: false, previousX: 0, previousY: 0, velocityX: 0, velocityY: 0, scrollOffset: 0};
      instances.push(instance);

      const resize = new ResizeObserver(() => {
        const width = Math.max(1, canvas.clientWidth);
        const height = Math.max(1, canvas.clientHeight);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        if (instance.ready && reducedMotion) renderer.render(scene, camera);
      });
      resize.observe(canvas);

      const observer = new IntersectionObserver(([entry]) => {
        instance.visible = entry.isIntersecting;
        if (instance.visible && instance.ready && reducedMotion) renderer.render(scene, camera);
      }, {rootMargin: '120px'});
      observer.observe(canvas);

      const materials = new MTLLoader().setPath(path);
      materials.load(`${kind}.mtl`, materialSet => {
        materialSet.preload();
        new OBJLoader().setMaterials(materialSet).setPath(path).load(`${kind}.obj`, object => {
          const bounds = new THREE.Box3().setFromObject(object);
          const center = bounds.getCenter(new THREE.Vector3());
          const size = bounds.getSize(new THREE.Vector3());
          object.position.sub(center);
          object.scale.setScalar(2.9 / Math.max(size.x, size.y, size.z));
          object.traverse(part => {
            if (part.isMesh) {
              part.material.side = THREE.DoubleSide;
              part.material.needsUpdate = true;
            }
          });
          group.add(object);
          instance.ready = true;
          if (instance.visible) renderer.render(scene, camera);
        });
      });

      canvas.addEventListener('pointerdown', event => {
        instance.dragging = true;
        instance.previousX = event.clientX;
        instance.previousY = event.clientY;
        instance.velocityX = instance.velocityY = 0;
        canvas.setPointerCapture(event.pointerId);
        canvas.classList.add('is-grabbing');
      });
      canvas.addEventListener('pointermove', event => {
        if (!instance.dragging) return;
        const dx = event.clientX - instance.previousX;
        const dy = event.clientY - instance.previousY;
        instance.baseY += dx * 0.009;
        instance.baseX += dy * 0.009;
        instance.velocityY = dx * 0.0007;
        instance.velocityX = dy * 0.0007;
        instance.previousX = event.clientX;
        instance.previousY = event.clientY;
      });
      const release = () => {
        instance.dragging = false;
        canvas.classList.remove('is-grabbing');
      };
      canvas.addEventListener('pointerup', release);
      canvas.addEventListener('pointercancel', release);
      canvas.addEventListener('keydown', event => {
        const step = event.shiftKey ? 0.22 : 0.1;
        if (event.key === 'ArrowLeft') instance.baseY -= step;
        else if (event.key === 'ArrowRight') instance.baseY += step;
        else if (event.key === 'ArrowUp') instance.baseX -= step;
        else if (event.key === 'ArrowDown') instance.baseX += step;
        else return;
        event.preventDefault();
      });
    } catch (error) {
      canvas.hidden = true;
    }
  }

  let previousScrollY = window.scrollY;
  window.addEventListener('scroll', () => {
    const currentScrollY = window.scrollY;
    const scrollDelta = currentScrollY - previousScrollY;
    previousScrollY = currentScrollY;
    if (reducedMotion || Math.abs(scrollDelta) < 1) return;
    for (const instance of instances) {
      instance.scrollOffset = THREE.MathUtils.clamp(instance.scrollOffset - scrollDelta * 0.001, -0.32, 0.32);
    }
  }, {passive: true});

  let started = false;
  let previousFrameTime = 0;
  function animate(time) {
    if (document.hidden) {
      requestAnimationFrame(animate);
      return;
    }
    for (const instance of instances) {
      if (!instance.visible || !instance.ready) continue;
      if (!reducedMotion) {
        instance.scrollOffset *= Math.pow(0.976, Math.min(48, time - previousFrameTime) / 16.67);
        if (Math.abs(instance.scrollOffset) < 0.0005) instance.scrollOffset = 0;
        instance.group.position.y = Math.sin(time * 0.00075 + instance.floatPhase) * 0.11 + instance.scrollOffset;
        if (!instance.dragging) {
          instance.baseY += instance.velocityY;
          instance.baseX += instance.velocityX;
          instance.velocityY *= 0.92;
          instance.velocityX *= 0.92;
          if (Math.abs(instance.velocityX) < 0.00015) instance.velocityX = 0;
          if (Math.abs(instance.velocityY) < 0.00015) instance.velocityY = 0;
        }
        instance.group.rotation.x = instance.baseX;
        instance.group.rotation.y = instance.baseY;
      }
      instance.renderer.render(instance.scene, instance.camera);
    }
    previousFrameTime = time;
    requestAnimationFrame(animate);
  }
  if (!started) {
    started = true;
    requestAnimationFrame(animate);
  }
}
