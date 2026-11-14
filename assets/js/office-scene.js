/* ฉาก 3 มิติสร้างขึ้นเองด้วย Three.js (MIT) ไม่ใช้ภาพ/ทรัพย์สินจาก Office Land */
import * as THREE from '../vendor/three.module.min.js';

export function createOfficeScene({ host, labels, groups, onChoose, onUnavailable, onRestored }) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 400);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcbb6aa, 2.05));
  const sun = new THREE.DirectionalLight(0xffffff, 2.1);
  sun.position.set(-9, 18, 13);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xe5e8ff, 0.65);
  fill.position.set(12, 7, -8);
  scene.add(fill);

  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const materials = new Map();
  const anchors = [];
  const tones = [
    { floor:'#f5e2d7', rug:'#e8b9aa', accent:'#d98f86', screen:'#d6c8f5' },
    { floor:'#e4f0e5', rug:'#b8d7c6', accent:'#7db9a0', screen:'#c7e8ea' },
    { floor:'#e8e7f9', rug:'#cbc5ed', accent:'#958bcc', screen:'#d7dcfa' },
    { floor:'#f9ecd9', rug:'#f0d1a3', accent:'#d7a46e', screen:'#f3d7c5' },
    { floor:'#e0eef6', rug:'#bcd7e7', accent:'#83adca', screen:'#c7dff3' },
    { floor:'#f7e5ef', rug:'#eac5d9', accent:'#d29ab9', screen:'#f3d9e7' },
  ];
  const mat = color => {
    const key = String(color);
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color: key, roughness: 0.88, metalness: 0 }));
    return materials.get(key);
  };
  const box = (parent, w, h, d, x, y, z, color) => {
    const mesh = new THREE.Mesh(unitBox, mat(color));
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const softShadow = (parent, w, d, x, z) => box(parent, w, 0.013, d, x, 0.157, z, '#cdbeb7');
  const plant = (parent, x, z, scale = 1) => {
    const g = new THREE.Group(); g.position.set(x, 0.16, z); g.scale.setScalar(scale); parent.add(g);
    box(g, .44,.34,.44,0,.17,0,'#d5977c');
    box(g, .49,.07,.49,0,.34,0,'#b97d68');
    box(g, .09,.57,.09,0,.64,0,'#75a47d');
    box(g, .42,.25,.36,-.16,.68,0,'#87bd91');
    box(g, .36,.27,.39,.18,.79,.02,'#6fae7f');
    box(g, .33,.30,.31,-.03,.98,0,'#93c99a');
  };
  const makeDesk = (parent, x, z, person, tone, index) => {
    const desk = new THREE.Group(); desk.position.set(x, 0, z); parent.add(desk);
    softShadow(desk, 1.27, .9, 0, 0);
    box(desk,1.40,.12,.76,0,.83,0,'#fffaf0');
    box(desk,.09,.70,.09,-.58,.48,-.26,'#d5a785');
    box(desk,.09,.70,.09,.58,.48,-.26,'#d5a785');
    box(desk,.09,.70,.09,-.58,.48,.26,'#d5a785');
    box(desk,.09,.70,.09,.58,.48,.26,'#d5a785');
    // จอและของใช้เป็นเฟอร์นิเจอร์จำลอง ไม่มีวิดีโอ
    box(desk,.66,.43,.09,0,1.13,-.16,'#5d657f');
    box(desk,.54,.30,.012,0,1.15,-.108,tone.screen);
    box(desk,.12,.15,.08,0,.90,-.16,'#727a91');
    box(desk,.31,.025,.16,0,.89,-.08,'#727a91');
    box(desk,.38,.018,.18,0,.90,.25,'#dedee7');
    box(desk,.11,.12,.11,.48,.95,.12, index % 2 ? '#efb48d' : '#b4cfb9');
    // เก้าอี้ว่างยังคงเป็นโต๊ะ ไม่สร้างตัวละครหากไม่มีเช็กอิน
    box(desk,.58,.12,.55,0,.52,.72,'#ac9ec9');
    box(desk,.60,.65,.12,0,.86,1.00,'#a294be');
    box(desk,.07,.36,.07,-.21,.32,.82,'#85869a');
    box(desk,.07,.36,.07,.21,.32,.82,'#85869a');
    if (!person) return;
    const figure = new THREE.Group(); figure.position.set(0, 0, .65); desk.add(figure);
    const skin = ['#f4c7a8','#e8b298','#f0b99c','#dca789'][index % 4];
    const hair = ['#55404a','#493c46','#725449','#3e4050'][index % 4];
    box(figure,.40,.46,.28,0,.90,0,person.color);
    box(figure,.105,.34,.12,-.24,.88,.01,skin);
    box(figure,.105,.34,.12,.24,.88,.01,skin);
    box(figure,.14,.29,.16,-.115,.58,.08,'#67728c');
    box(figure,.14,.29,.16,.115,.58,.08,'#67728c');
    box(figure,.19,.08,.24,-.115,.42,.12,'#505b70');
    box(figure,.19,.08,.24,.115,.42,.12,'#505b70');
    box(figure,.46,.43,.35,0,1.34,0,skin);
    box(figure,.49,.13,.39,0,1.57,-.01,hair);
    box(figure,.11,.24,.39,-.19,1.45,-.01,hair);
    box(figure,.40,.16,.07,0,1.49,.17,hair);
    box(figure,.045,.065,.012,-.105,1.34,.18,'#4f4248');
    box(figure,.045,.065,.012,.105,1.34,.18,'#4f4248');
    box(figure,.10,.025,.012,0,1.23,.18,'#c78379');
  };
  const roomWidth = 6.25, gap = .38;
  const columnCount = Math.min(2, groups.length);
  const layoutRows = [];
  for (let i = 0; i < groups.length; i += columnCount) {
    const row = groups.slice(i, i + columnCount);
    const depth = Math.max(...row.map(g => 3.8 + Math.max(1, Math.ceil(Math.max(3, g.office.length) / 3)) * 1.72));
    layoutRows.push({ groups: row, depth });
  }
  const worldWidth = columnCount * roomWidth + (columnCount - 1) * gap;
  const worldDepth = layoutRows.reduce((sum, row) => sum + row.depth, 0) + (layoutRows.length - 1) * gap;
  box(scene, worldWidth + .7, .28, worldDepth + .7, 0, -.02, 0, '#d5bbae');
  box(scene, worldWidth + .55, .12, worldDepth + .55, 0, .12, 0, '#f7ede4');

  let cursorZ = -worldDepth / 2;
  const totalPeople = groups.reduce((sum, g) => sum + g.office.length, 0);
  layoutRows.forEach(row => {
    const z = cursorZ + row.depth / 2;
    row.groups.forEach((group, column) => {
      const x = (column - (row.groups.length - 1) / 2) * (roomWidth + gap);
      const tone = tones[group.index % tones.length];
      const room = new THREE.Group(); room.position.set(x, 0, z); scene.add(room);
      box(room, roomWidth, .10, row.depth, 0, .16, 0, tone.floor);
      // ผนังด้านหลังและด้านข้างเตี้ยให้มองเห็นภายในแบบ isometric
      box(room, roomWidth, 1.18, .12, 0, .78, -row.depth / 2 + .06, '#fbf8f0');
      box(room, .12, 1.18, row.depth, -roomWidth / 2 + .06, .78, 0, '#f4f1e9');
      box(room, roomWidth, .08, .16, 0, 1.40, -row.depth / 2 + .06, '#e1d7ce');
      box(room, .16, .08, row.depth, -roomWidth / 2 + .06, 1.40, 0, '#e1d7ce');
      box(room, roomWidth, .08, .07, 0, .30, -row.depth / 2 + .15, tone.accent);
      // หน้าต่าง กรอบรูป และแผ่นพรมสร้างบรรยากาศแต่ไม่ปะปนกับข้อมูลบุคคล
      box(room, 1.28, .66, .03, -1.55, 1.00, -row.depth / 2 + .14, '#d7edf4');
      box(room, .05, .66, .035, -1.55, 1.00, -row.depth / 2 + .16, '#ffffff');
      box(room, 1.28, .05, .035, -1.55, 1.00, -row.depth / 2 + .16, '#ffffff');
      box(room, .86, .55, .035, 1.35, 1.01, -row.depth / 2 + .14, tone.accent);
      box(room, .68, .38, .04, 1.35, 1.01, -row.depth / 2 + .17, '#fff7df');
      box(room, roomWidth - .7, .018, row.depth - .7, 0, .221, 0, '#f9f4eb');
      box(room, roomWidth - 1.05, .022, row.depth - 1.0, 0, .234, 0, tone.floor);
      box(room, roomWidth - 1.1, .025, .42, 0, .25, row.depth / 2 - .75, tone.rug);
      const seats = Math.max(3, group.office.length);
      for (let i = 0; i < seats; i++) {
        const col = i % 3, r = Math.floor(i / 3);
        const px = (col - 1) * 1.73;
        const pz = -row.depth / 2 + 1.53 + r * 1.72;
        const person = group.office[i];
        makeDesk(room, px, pz, person, tone, i);
        if (person && totalPeople <= 12) {
          const tag = document.createElement('span');
          tag.className = 'office-scene-person-label';
          tag.textContent = person.nickname || person.name || 'สมาชิก';
          labels.appendChild(tag);
          anchors.push({ node: tag, position: new THREE.Vector3(x + px, 1.96, z + pz + .65) });
        }
      }
      plant(room, -roomWidth / 2 + .63, row.depth / 2 - .65, .9);
      // ตู้/ม้านั่งส่วนกลางที่ด้านหน้าของแต่ละแผนก
      box(room, 1.02, .42, .48, roomWidth / 2 - .95, .47, row.depth / 2 - .72, '#c99d8c');
      box(room, 1.08, .12, .54, roomWidth / 2 - .95, .73, row.depth / 2 - .72, '#f4c5a7');
      const label = document.createElement('button');
      label.type = 'button';
      label.className = 'office-scene-dept-label';
      const dot = document.createElement('i'); dot.className = `office-tone-${group.index % 6}`;
      const name = document.createElement('span'); name.textContent = group.name;
      const count = document.createElement('small'); count.textContent = `${group.office.length} คน`;
      label.append(dot, name, count);
      label.setAttribute('aria-label', `${group.name}, เช็กอินออฟฟิศ ${group.office.length} คน`);
      label.title = group.name;
      label.addEventListener('click', () => onChoose(group.index));
      labels.appendChild(label);
      anchors.push({ node: label, position: new THREE.Vector3(x, 2.15, z - row.depth / 2 + .1) });
    });
    cursorZ += row.depth + gap;
  });

  let yaw = .65, pitch = .83, zoom = 1, disposed = false, contextLost = false, pointer = null;
  const initial = { yaw, pitch, zoom };
  const target = new THREE.Vector3(0, .35, 0);
  const projectLabels = () => {
    const width = host.clientWidth, height = host.clientHeight;
    anchors.forEach(({ node, position }) => {
      const v = position.clone().project(camera);
      const visible = v.z > -1 && v.z < 1 && v.x > -1.05 && v.x < 1.05 && v.y > -1.05 && v.y < 1.05;
      node.style.display = visible ? '' : 'none';
      if (visible) node.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) * width / 2).toFixed(1)}px, ${((-v.y + 1) * height / 2).toFixed(1)}px)`;
    });
  };
  const draw = () => {
    if (disposed || contextLost) return;
    const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight), aspect = width / height;
    const distance = Math.max(worldWidth, worldDepth) * 2.2 + 10;
    camera.position.set(Math.sin(yaw) * Math.cos(pitch) * distance, Math.sin(pitch) * distance, Math.cos(yaw) * Math.cos(pitch) * distance);
    camera.lookAt(target);
    const projectedWidth = Math.abs(Math.cos(yaw)) * (worldWidth + 1) + Math.abs(Math.sin(yaw)) * (worldDepth + 1);
    const projectedDepth = Math.abs(Math.sin(yaw)) * (worldWidth + 1) + Math.abs(Math.cos(yaw)) * (worldDepth + 1);
    const halfHeight = Math.max((projectedWidth / 2 + .8) / aspect, projectedDepth * Math.sin(pitch) / 2 + 2.0) / zoom;
    camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect;
    camera.top = halfHeight; camera.bottom = -halfHeight;
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    renderer.setSize(width, height, false);
    renderer.render(scene, camera);
    projectLabels();
  };
  const onDown = event => {
    if (event.button !== undefined && event.button !== 0) return;
    pointer = { x:event.clientX, y:event.clientY };
    renderer.domElement.setPointerCapture?.(event.pointerId);
    host.classList.add('is-dragging');
  };
  const onMove = event => {
    if (!pointer) return;
    yaw += (event.clientX - pointer.x) * .008;
    pitch = Math.min(1.19, Math.max(.46, pitch + (event.clientY - pointer.y) * .004));
    pointer = { x:event.clientX, y:event.clientY }; draw();
  };
  const onUp = () => { pointer = null; host.classList.remove('is-dragging'); };
  const onWheel = event => { event.preventDefault(); zoom = Math.max(.65, Math.min(2.4, zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1))); draw(); };
  const onContextLost = event => {
    event.preventDefault();
    contextLost = true;
    if (!disposed) onUnavailable?.();
  };
  const onContextRestored = () => {
    if (disposed) return;
    contextLost = false;
    onRestored?.();
    draw();
  };
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointermove', onMove);
  renderer.domElement.addEventListener('pointerup', onUp);
  renderer.domElement.addEventListener('pointercancel', onUp);
  renderer.domElement.addEventListener('wheel', onWheel, { passive:false });
  renderer.domElement.addEventListener('webglcontextlost', onContextLost);
  renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);
  const onResize = () => draw();
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
  if (observer) observer.observe(host); else window.addEventListener('resize', onResize);
  draw();
  return {
    zoom(factor) { zoom = Math.max(.65, Math.min(2.4, zoom * factor)); draw(); },
    turn(angle) { yaw += angle; draw(); },
    reset() { yaw = initial.yaw; pitch = initial.pitch; zoom = initial.zoom; draw(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (observer) observer.disconnect(); else window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('pointercancel', onUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      anchors.forEach(({ node }) => node.remove());
      unitBox.dispose(); materials.forEach(m => m.dispose());
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    },
  };
}
