"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

type Phase = "intro" | "playing" | "paused" | "ended";

type Target = {
  group: THREE.Group;
  active: boolean;
  bob: number;
  speed: number;
  respawnAt: number;
};

type Spark = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
};

type Bubble = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
};

type GameApi = {
  reset: () => void;
  resume: () => void;
  setMuted: (value: boolean) => void;
  shoot: () => void;
};

const ROUND_SECONDS = 75;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const apiRef = useRef<GameApi | null>(null);
  const phaseRef = useRef<Phase>("intro");
  const mutedRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("intro");
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [hearts, setHearts] = useState(3);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [wave, setWave] = useState(1);
  const [streak, setStreak] = useState(0);
  const [muted, setMuted] = useState(false);
  const [hurt, setHurt] = useState(false);
  const [endReason, setEndReason] = useState<"time" | "shield">("time");

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    const saved = Number(window.localStorage.getItem("bubble-blaster-best") || 0);
    setBestScore(Number.isFinite(saved) ? saved : 0);

    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#87d9ff");
    scene.fog = new THREE.Fog("#b7e8ff", 21, 48);

    const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
    camera.position.set(0, 1.65, 8);
    camera.rotation.order = "YXZ";
    scene.add(camera);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const hemi = new THREE.HemisphereLight("#fff7d6", "#77b96c", 2.6);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight("#fff4c2", 4.2);
    sun.position.set(-9, 16, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -28;
    sun.shadow.camera.right = 28;
    sun.shadow.camera.top = 28;
    sun.shadow.camera.bottom = -28;
    scene.add(sun);

    const flat = (color: string, roughness = 0.8) =>
      new THREE.MeshStandardMaterial({ color, roughness, flatShading: true });

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(32, 64),
      flat("#72c96b", 1),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const path = new THREE.Mesh(
      new THREE.RingGeometry(8.6, 11.2, 64),
      flat("#f6d69a", 1),
    );
    path.rotation.x = -Math.PI / 2;
    path.position.y = 0.012;
    path.receiveShadow = true;
    scene.add(path);

    const centerPatch = new THREE.Mesh(
      new THREE.CircleGeometry(5.2, 40),
      flat("#9bdd72", 1),
    );
    centerPatch.rotation.x = -Math.PI / 2;
    centerPatch.position.y = 0.018;
    scene.add(centerPatch);

    const addTree = (x: number, z: number, color: string, scale = 1) => {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.23, 0.31, 1.75, 8),
        flat("#a86f4d"),
      );
      trunk.position.y = 0.88;
      trunk.castShadow = true;
      const crown = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.05, 1),
        flat(color),
      );
      crown.position.y = 2.15;
      crown.scale.set(1.08, 1.18, 1.08);
      crown.castShadow = true;
      tree.add(trunk, crown);
      tree.position.set(x, 0, z);
      tree.scale.setScalar(scale);
      scene.add(tree);
    };

    const treeColors = ["#43b86a", "#62c75d", "#35aa78", "#7ac85a"];
    for (let i = 0; i < 24; i += 1) {
      const angle = (i / 24) * Math.PI * 2 + 0.12;
      const radius = 19 + (i % 3) * 1.7;
      addTree(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        treeColors[i % treeColors.length],
        0.9 + (i % 4) * 0.08,
      );
    }

    const addFlower = (x: number, z: number, color: string) => {
      const flower = new THREE.Group();
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.035, 0.45, 6),
        flat("#278f55"),
      );
      stem.position.y = 0.23;
      const petals = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.14, 0),
        flat(color, 0.6),
      );
      petals.position.y = 0.5;
      flower.add(stem, petals);
      flower.position.set(x, 0, z);
      scene.add(flower);
    };

    const flowerColors = ["#ff769b", "#ffd54d", "#9b7bff", "#ff9e54"];
    for (let i = 0; i < 48; i += 1) {
      const angle = i * 2.41;
      const radius = 4 + ((i * 7) % 14);
      addFlower(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        flowerColors[i % flowerColors.length],
      );
    }

    const clouds: THREE.Group[] = [];
    for (let i = 0; i < 7; i += 1) {
      const cloud = new THREE.Group();
      const cloudMaterial = new THREE.MeshStandardMaterial({
        color: "#ffffff",
        roughness: 1,
        transparent: true,
        opacity: 0.92,
      });
      const pieces = [
        [-0.8, 0, 0, 0.72],
        [0, 0.18, 0, 0.95],
        [0.85, 0.02, 0, 0.68],
        [0.2, -0.12, 0, 0.72],
      ];
      pieces.forEach(([x, y, z, size]) => {
        const puff = new THREE.Mesh(
          new THREE.IcosahedronGeometry(size, 2),
          cloudMaterial,
        );
        puff.position.set(x, y, z);
        cloud.add(puff);
      });
      const angle = (i / 7) * Math.PI * 2;
      cloud.position.set(Math.cos(angle) * 25, 9 + (i % 3), Math.sin(angle) * 25);
      cloud.rotation.y = -angle;
      cloud.scale.setScalar(1.15 + (i % 2) * 0.35);
      clouds.push(cloud);
      scene.add(cloud);
    }

    const rainbow = new THREE.Group();
    const rainbowColors = ["#ff6688", "#ffb347", "#ffe15b", "#58c878", "#55aaf8", "#9c77f5"];
    rainbowColors.forEach((color, index) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(3.8 - index * 0.24, 0.13, 10, 48, Math.PI),
        new THREE.MeshBasicMaterial({ color }),
      );
      ring.rotation.z = Math.PI;
      ring.position.y = -index * 0.03;
      rainbow.add(ring);
    });
    rainbow.position.set(-15, 5.2, -18);
    rainbow.rotation.y = 0.55;
    scene.add(rainbow);

    const blaster = new THREE.Group();
    const blasterBody = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.13, 0.42, 5, 9),
      flat("#6c5ce7", 0.35),
    );
    blasterBody.rotation.z = Math.PI / 2;
    const blasterTank = new THREE.Mesh(
      new THREE.SphereGeometry(0.19, 16, 12),
      new THREE.MeshStandardMaterial({
        color: "#68e0ff",
        roughness: 0.2,
        transparent: true,
        opacity: 0.82,
      }),
    );
    blasterTank.position.set(0.02, 0.12, 0.12);
    const blasterTip = new THREE.Mesh(
      new THREE.TorusGeometry(0.13, 0.045, 8, 18),
      flat("#ffd84d", 0.3),
    );
    blasterTip.rotation.y = Math.PI / 2;
    blasterTip.position.x = -0.36;
    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.35, 0.18),
      flat("#ff7396", 0.5),
    );
    handle.rotation.z = -0.18;
    handle.position.set(0.13, -0.24, 0.03);
    blaster.add(blasterBody, blasterTank, blasterTip, handle);
    blaster.position.set(0.43, -0.38, -0.72);
    blaster.rotation.y = -0.06;
    camera.add(blaster);

    const targets: Target[] = [];
    const sparks: Spark[] = [];
    const bubbles: Bubble[] = [];
    const targetPalette = ["#ff769b", "#8b7bff", "#ff9f43", "#36c7a5", "#5da9ff"];

    const setTargetPosition = (target: Target) => {
      const angle = Math.random() * Math.PI * 2;
      const radius = 11 + Math.random() * 9;
      target.group.position.set(
        Math.cos(angle) * radius,
        1.15 + Math.random() * 0.55,
        Math.sin(angle) * radius,
      );
      target.group.rotation.y = Math.random() * Math.PI * 2;
    };

    const createTarget = (index: number) => {
      const group = new THREE.Group();
      const color = targetPalette[index % targetPalette.length];
      const bodyMaterial = flat(color, 0.42);
      const bellyMaterial = flat("#fff4c7", 0.6);
      const darkMaterial = flat("#263456", 0.38);
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12), bodyMaterial);
      body.scale.y = 1.08;
      body.castShadow = true;
      const belly = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 10), bellyMaterial);
      belly.position.set(0, -0.1, 0.48);
      belly.scale.set(1, 1.08, 0.3);

      const earGeometry = new THREE.ConeGeometry(0.2, 0.52, 8);
      const earLeft = new THREE.Mesh(earGeometry, bodyMaterial);
      earLeft.position.set(-0.34, 0.55, 0);
      earLeft.rotation.z = -0.28;
      const earRight = earLeft.clone();
      earRight.position.x = 0.34;
      earRight.rotation.z = 0.28;

      const eyeGeometry = new THREE.SphereGeometry(0.085, 10, 8);
      const eyeLeft = new THREE.Mesh(eyeGeometry, darkMaterial);
      eyeLeft.position.set(-0.2, 0.16, 0.57);
      const eyeRight = eyeLeft.clone();
      eyeRight.position.x = 0.2;
      const sparkleGeometry = new THREE.SphereGeometry(0.027, 8, 6);
      const sparkleMaterial = new THREE.MeshBasicMaterial({ color: "#ffffff" });
      const eyeSparkleLeft = new THREE.Mesh(sparkleGeometry, sparkleMaterial);
      eyeSparkleLeft.position.set(-0.17, 0.2, 0.64);
      const eyeSparkleRight = eyeSparkleLeft.clone();
      eyeSparkleRight.position.x = 0.23;
      const smile = new THREE.Mesh(
        new THREE.TorusGeometry(0.13, 0.025, 7, 16, Math.PI),
        darkMaterial,
      );
      smile.position.set(0, -0.08, 0.635);
      smile.rotation.z = Math.PI;

      group.add(
        body,
        belly,
        earLeft,
        earRight,
        eyeLeft,
        eyeRight,
        eyeSparkleLeft,
        eyeSparkleRight,
        smile,
      );
      const target: Target = {
        group,
        active: true,
        bob: Math.random() * Math.PI * 2,
        speed: 0.42 + Math.random() * 0.18,
        respawnAt: 0,
      };
      group.traverse((child) => {
        child.userData.bubbleTarget = target;
      });
      setTargetPosition(target);
      targets.push(target);
      scene.add(group);
    };

    for (let i = 0; i < 8; i += 1) createTarget(i);

    const raycaster = new THREE.Raycaster();
    const center = new THREE.Vector2(0, 0);
    const keys = new Set<string>();
    const velocity = new THREE.Vector3();
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const clockDirection = new THREE.Vector3();
    let yaw = 0;
    let pitch = 0;
    let playing = false;
    let scoreValue = 0;
    let heartsValue = 3;
    let roundRemaining = ROUND_SECONDS;
    let lastShownSecond = ROUND_SECONDS;
    let roundStartedAt = 0;
    let pausedAt = 0;
    let lastFrame = performance.now();
    let lastShotAt = 0;
    let lastHitAt = 0;
    let streakValue = 0;
    let weaponKick = 0;
    let audioContext: AudioContext | null = null;
    let musicGain: GainNode | null = null;
    let musicTimer: number | null = null;
    let musicStep = 0;
    let nextMusicNote = 0;
    let touchId: number | null = null;
    let touchX = 0;
    let touchY = 0;
    let touchMoved = false;
    let draggingMouse = false;
    let mouseDragX = 0;
    let mouseDragY = 0;
    let mouseDragged = false;

    const safelyRequestPointerLock = () => {
      try {
        void Promise.resolve(canvas.requestPointerLock()).catch(() => undefined);
      } catch {
        // Embedded browsers may not support pointer lock. Drag-to-look remains available.
      }
    };

    const ensureAudioContext = () => {
      audioContext ??= new AudioContext();
      if (audioContext.state === "suspended") {
        void audioContext.resume().catch(() => undefined);
      }
      return audioContext;
    };

    const createMusicVoice = (
      frequency: number,
      start: number,
      duration: number,
      volume: number,
      type: OscillatorType,
      detune = 0,
    ) => {
      if (!audioContext || !musicGain) return;
      const oscillator = audioContext.createOscillator();
      const filter = audioContext.createBiquadFilter();
      const gain = audioContext.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.detune.setValueAtTime(detune, start);
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(type === "square" ? 1650 : 1250, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.014);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      oscillator.connect(filter).connect(gain).connect(musicGain);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.03);
    };

    const createKick = (start: number) => {
      if (!audioContext || !musicGain) return;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(135, start);
      oscillator.frequency.exponentialRampToValueAtTime(45, start + 0.13);
      gain.gain.setValueAtTime(0.075, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.16);
      oscillator.connect(gain).connect(musicGain);
      oscillator.start(start);
      oscillator.stop(start + 0.18);
    };

    const createTick = (start: number, accent: boolean) => {
      if (!audioContext || !musicGain) return;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(accent ? 1450 : 1900, start);
      gain.gain.setValueAtTime(accent ? 0.012 : 0.006, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + (accent ? 0.075 : 0.035));
      oscillator.connect(gain).connect(musicGain);
      oscillator.start(start);
      oscillator.stop(start + 0.085);
    };

    const melody = [
      659.25, 783.99, 880, 783.99,
      659.25, 587.33, 659.25, 783.99,
      880, 1046.5, 880, 783.99,
      659.25, 587.33, 523.25, 587.33,
    ];
    const bassLine = [130.81, 174.61, 196, 164.81];

    const scheduleMusicStep = (step: number, start: number) => {
      const phraseStep = step % 16;
      if (phraseStep % 2 === 0 || phraseStep === 3 || phraseStep === 11) {
        const note = melody[phraseStep];
        createMusicVoice(note, start, 0.19, 0.035, "triangle");
        createMusicVoice(note * 2, start, 0.105, 0.011, "square", 5);
      }
      if (phraseStep % 4 === 0) {
        createMusicVoice(bassLine[Math.floor(phraseStep / 4)], start, 0.42, 0.052, "triangle");
      }
      if (phraseStep === 0 || phraseStep === 8) createKick(start);
      createTick(start, phraseStep === 4 || phraseStep === 12);
    };

    const musicScheduler = () => {
      if (!audioContext || !musicGain || mutedRef.current) return;
      while (nextMusicNote < audioContext.currentTime + 0.12) {
        scheduleMusicStep(musicStep, nextMusicNote);
        musicStep += 1;
        nextMusicNote += 0.126;
      }
    };

    const stopMusic = () => {
      if (musicTimer !== null) {
        window.clearInterval(musicTimer);
        musicTimer = null;
      }
      if (audioContext && musicGain) {
        musicGain.gain.cancelScheduledValues(audioContext.currentTime);
        musicGain.gain.setTargetAtTime(0.001, audioContext.currentTime, 0.06);
      }
    };

    const startMusic = () => {
      if (mutedRef.current || musicTimer !== null) return;
      try {
        const context = ensureAudioContext();
        if (!musicGain) {
          musicGain = context.createGain();
          musicGain.connect(context.destination);
        }
        musicGain.gain.cancelScheduledValues(context.currentTime);
        musicGain.gain.setTargetAtTime(0.62, context.currentTime, 0.09);
        musicStep = 0;
        nextMusicNote = context.currentTime + 0.045;
        musicScheduler();
        musicTimer = window.setInterval(musicScheduler, 45);
      } catch {
        // The game remains playable when browser audio is unavailable.
      }
    };

    const setAudioMuted = (value: boolean) => {
      mutedRef.current = value;
      if (value) {
        stopMusic();
      } else if (playing) {
        startMusic();
      }
    };

    const tone = (frequency: number, endFrequency: number, duration: number, volume: number) => {
      if (mutedRef.current) return;
      try {
        const context = ensureAudioContext();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, context.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(
          endFrequency,
          context.currentTime + duration,
        );
        gain.gain.setValueAtTime(volume, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + duration);
      } catch {
        // Audio is a bonus; gameplay remains fully available when audio is blocked.
      }
    };

    const spawnSparks = (position: THREE.Vector3, color: THREE.Color) => {
      for (let i = 0; i < 13; i += 1) {
        const mesh = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.075 + Math.random() * 0.055, 0),
          new THREE.MeshBasicMaterial({ color }),
        );
        mesh.position.copy(position);
        const velocitySpark = new THREE.Vector3(
          (Math.random() - 0.5) * 4,
          Math.random() * 3.2,
          (Math.random() - 0.5) * 4,
        );
        sparks.push({ mesh, velocity: velocitySpark, life: 0.72 + Math.random() * 0.25 });
        scene.add(mesh);
      }
    };

    const respawnTarget = (target: Target) => {
      target.active = true;
      target.respawnAt = 0;
      target.speed = 0.42 + (4 - Math.ceil(roundRemaining / 20)) * 0.08 + Math.random() * 0.2;
      target.group.scale.setScalar(0.1);
      setTargetPosition(target);
      scene.add(target.group);
    };

    const hideTarget = (target: Target, delay: number) => {
      target.active = false;
      target.respawnAt = performance.now() + delay;
      scene.remove(target.group);
    };

    const finishRound = (reason: "time" | "shield") => {
      if (!playing) return;
      playing = false;
      stopMusic();
      setEndReason(reason);
      setPhase("ended");
      phaseRef.current = "ended";
      const savedBest = Number(window.localStorage.getItem("bubble-blaster-best") || 0);
      if (scoreValue > savedBest) {
        window.localStorage.setItem("bubble-blaster-best", String(scoreValue));
        setBestScore(scoreValue);
      }
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      tone(reason === "time" ? 520 : 280, reason === "time" ? 880 : 180, 0.45, 0.08);
    };

    const shoot = () => {
      if (!playing || performance.now() - lastShotAt < 170) return;
      lastShotAt = performance.now();
      weaponKick = 1;
      tone(640, 980, 0.09, 0.045);

      camera.getWorldDirection(clockDirection);
      const bubbleMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.085, 12, 8),
        new THREE.MeshBasicMaterial({ color: "#d9fbff", transparent: true, opacity: 0.8 }),
      );
      bubbleMesh.position.copy(camera.position).addScaledVector(clockDirection, 0.7);
      bubbles.push({
        mesh: bubbleMesh,
        velocity: clockDirection.clone().multiplyScalar(23),
        life: 0.55,
      });
      scene.add(bubbleMesh);

      raycaster.setFromCamera(center, camera);
      const activeGroups = targets.filter((target) => target.active).map((target) => target.group);
      const hit = raycaster.intersectObjects(activeGroups, true)[0];
      const target = hit?.object.userData.bubbleTarget as Target | undefined;
      if (!target?.active) {
        streakValue = 0;
        setStreak(0);
        return;
      }

      const now = performance.now();
      streakValue = now - lastHitAt < 2200 ? streakValue + 1 : 1;
      lastHitAt = now;
      const bonus = Math.min(4, streakValue - 1) * 2;
      scoreValue += 10 + bonus;
      setScore(scoreValue);
      setStreak(streakValue);
      const body = target.group.children[0] as THREE.Mesh;
      const material = body.material as THREE.MeshStandardMaterial;
      spawnSparks(hit.point, material.color);
      hideTarget(target, 520 + Math.random() * 450);
      tone(420, 1180, 0.16, 0.07);
    };

    const reset = () => {
      scoreValue = 0;
      heartsValue = 3;
      roundRemaining = ROUND_SECONDS;
      lastShownSecond = ROUND_SECONDS;
      streakValue = 0;
      yaw = 0;
      pitch = 0;
      velocity.set(0, 0, 0);
      camera.position.set(0, 1.65, 8);
      camera.rotation.set(0, 0, 0);
      setScore(0);
      setHearts(3);
      setTimeLeft(ROUND_SECONDS);
      setWave(1);
      setStreak(0);
      setHurt(false);
      targets.forEach((target) => {
        if (target.group.parent) scene.remove(target.group);
        respawnTarget(target);
      });
      sparks.splice(0).forEach((spark) => scene.remove(spark.mesh));
      bubbles.splice(0).forEach((bubble) => scene.remove(bubble.mesh));
      roundStartedAt = performance.now();
      lastFrame = performance.now();
      playing = true;
      stopMusic();
      startMusic();
    };

    const resume = () => {
      if (playing) return;
      const now = performance.now();
      if (pausedAt) roundStartedAt += now - pausedAt;
      lastFrame = now;
      playing = true;
      startMusic();
    };

    apiRef.current = { reset, resume, setMuted: setAudioMuted, shoot };

    const onResize = () => {
      const width = canvas.clientWidth || window.innerWidth;
      const height = canvas.clientHeight || window.innerHeight;
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    onResize();

    const onKeyDown = (event: KeyboardEvent) => {
      const code = event.code;
      if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(code)) {
        keys.add(code);
      }
      if (code === "Space") {
        event.preventDefault();
        shoot();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => keys.delete(event.code);

    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== canvas || !playing) return;
      yaw -= event.movementX * 0.00225;
      pitch = clamp(pitch - event.movementY * 0.00195, -1.12, 1.06);
    };

    const onCanvasPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        touchId = event.pointerId;
        touchX = event.clientX;
        touchY = event.clientY;
        touchMoved = false;
        canvas.setPointerCapture(event.pointerId);
        return;
      }
      if (!playing) return;
      if (document.pointerLockElement !== canvas) {
        draggingMouse = true;
        mouseDragX = event.clientX;
        mouseDragY = event.clientY;
        mouseDragged = false;
        canvas.setPointerCapture(event.pointerId);
        safelyRequestPointerLock();
      } else {
        shoot();
      }
    };

    const onCanvasPointerMove = (event: PointerEvent) => {
      if (!playing) return;
      if (event.pointerType === "touch" && touchId === event.pointerId) {
        const dx = event.clientX - touchX;
        const dy = event.clientY - touchY;
        if (Math.abs(dx) + Math.abs(dy) > 3) touchMoved = true;
        yaw -= dx * 0.0062;
        pitch = clamp(pitch - dy * 0.0052, -1.12, 1.06);
        touchX = event.clientX;
        touchY = event.clientY;
        return;
      }
      if (event.pointerType === "mouse" && draggingMouse && document.pointerLockElement !== canvas) {
        const dx = event.clientX - mouseDragX;
        const dy = event.clientY - mouseDragY;
        if (Math.abs(dx) + Math.abs(dy) > 2) mouseDragged = true;
        yaw -= dx * 0.0062;
        pitch = clamp(pitch - dy * 0.0052, -1.12, 1.06);
        mouseDragX = event.clientX;
        mouseDragY = event.clientY;
      }
    };

    const onCanvasPointerUp = (event: PointerEvent) => {
      if (event.pointerType === "touch" && touchId === event.pointerId) {
        if (!touchMoved) shoot();
        touchId = null;
        return;
      }
      if (event.pointerType === "mouse" && draggingMouse) {
        if (!mouseDragged) shoot();
        draggingMouse = false;
      }
    };

    const onPointerLockChange = () => {
      if (document.pointerLockElement !== canvas && playing && phaseRef.current === "playing") {
        playing = false;
        stopMusic();
        pausedAt = performance.now();
        setPhase("paused");
        phaseRef.current = "paused";
      }
    };

    const onContextMenu = (event: MouseEvent) => event.preventDefault();

    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("pointerlockchange", onPointerLockChange);
    canvas.addEventListener("pointerdown", onCanvasPointerDown);
    canvas.addEventListener("pointermove", onCanvasPointerMove);
    canvas.addEventListener("pointerup", onCanvasPointerUp);
    canvas.addEventListener("pointercancel", onCanvasPointerUp);
    canvas.addEventListener("contextmenu", onContextMenu);

    const animate = (now: number) => {
      const dt = Math.min(0.035, Math.max(0.001, (now - lastFrame) / 1000));
      lastFrame = now;
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;

      clouds.forEach((cloud, index) => {
        cloud.rotation.y += dt * (0.012 + index * 0.001);
      });

      if (playing) {
        roundRemaining = ROUND_SECONDS - (now - roundStartedAt) / 1000;
        const shownSecond = Math.max(0, Math.ceil(roundRemaining));
        if (shownSecond !== lastShownSecond) {
          lastShownSecond = shownSecond;
          setTimeLeft(shownSecond);
          const waveValue = Math.min(4, Math.floor((ROUND_SECONDS - shownSecond) / 19) + 1);
          setWave(waveValue);
        }
        if (roundRemaining <= 0) finishRound("time");

        const forwardInput =
          (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) -
          (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
        const sideInput =
          (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) -
          (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
        forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
        right.set(Math.cos(yaw), 0, -Math.sin(yaw));
        const desired = forward
          .clone()
          .multiplyScalar(forwardInput)
          .addScaledVector(right, sideInput)
          .normalize()
          .multiplyScalar(forwardInput || sideInput ? 5.4 : 0);
        velocity.lerp(desired, 1 - Math.exp(-dt * 10));
        camera.position.addScaledVector(velocity, dt);
        camera.position.x = clamp(camera.position.x, -18.5, 18.5);
        camera.position.z = clamp(camera.position.z, -18.5, 18.5);
        camera.position.y = 1.65 + Math.sin(now * 0.009) * Math.min(0.035, velocity.length() * 0.007);

        targets.forEach((target) => {
          if (!target.active) {
            if (now >= target.respawnAt) respawnTarget(target);
            return;
          }
          target.group.scale.lerp(new THREE.Vector3(1, 1, 1), 1 - Math.exp(-dt * 7));
          target.group.position.y += Math.sin(now * 0.0024 + target.bob) * dt * 0.22;
          const toPlayer = new THREE.Vector3(
            camera.position.x - target.group.position.x,
            0,
            camera.position.z - target.group.position.z,
          );
          const distance = toPlayer.length();
          if (distance > 0.001) {
            toPlayer.normalize();
            target.group.position.addScaledVector(toPlayer, target.speed * dt);
            target.group.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
          }
          if (distance < 1.38) {
            hideTarget(target, 1150);
            heartsValue -= 1;
            setHearts(heartsValue);
            setStreak(0);
            streakValue = 0;
            setHurt(true);
            window.setTimeout(() => setHurt(false), 360);
            tone(210, 130, 0.2, 0.08);
            if (heartsValue <= 0) finishRound("shield");
          }
        });

        weaponKick = Math.max(0, weaponKick - dt * 7.5);
        blaster.position.z = -0.72 + Math.sin(weaponKick * Math.PI) * 0.095;
        blaster.rotation.x = weaponKick * 0.07;
      }

      for (let i = sparks.length - 1; i >= 0; i -= 1) {
        const spark = sparks[i];
        spark.life -= dt;
        spark.velocity.y -= 4.5 * dt;
        spark.mesh.position.addScaledVector(spark.velocity, dt);
        spark.mesh.rotation.x += dt * 8;
        spark.mesh.rotation.y += dt * 6;
        spark.mesh.scale.setScalar(Math.max(0.01, spark.life * 1.2));
        if (spark.life <= 0) {
          scene.remove(spark.mesh);
          sparks.splice(i, 1);
        }
      }

      for (let i = bubbles.length - 1; i >= 0; i -= 1) {
        const bubble = bubbles[i];
        bubble.life -= dt;
        bubble.mesh.position.addScaledVector(bubble.velocity, dt);
        const material = bubble.mesh.material as THREE.MeshBasicMaterial;
        material.opacity = Math.max(0, bubble.life * 1.7);
        if (bubble.life <= 0) {
          scene.remove(bubble.mesh);
          bubbles.splice(i, 1);
        }
      }

      renderer.render(scene, camera);
    };

    renderer.setAnimationLoop(animate);

    return () => {
      renderer.setAnimationLoop(null);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      canvas.removeEventListener("pointerdown", onCanvasPointerDown);
      canvas.removeEventListener("pointermove", onCanvasPointerMove);
      canvas.removeEventListener("pointerup", onCanvasPointerUp);
      canvas.removeEventListener("pointercancel", onCanvasPointerUp);
      canvas.removeEventListener("contextmenu", onContextMenu);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      stopMusic();
      renderer.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      audioContext?.close().catch(() => undefined);
      apiRef.current = null;
    };
  }, []);

  const requestPointerLock = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || window.matchMedia("(pointer: coarse)").matches) return;
    try {
      void Promise.resolve(canvas.requestPointerLock()).catch(() => undefined);
    } catch {
      // Drag-to-look is used when pointer lock is unavailable.
    }
  }, []);

  const startGame = () => {
    apiRef.current?.reset();
    setPhase("playing");
    phaseRef.current = "playing";
    requestPointerLock();
  };

  const resumeGame = () => {
    apiRef.current?.resume();
    setPhase("playing");
    phaseRef.current = "playing";
    requestPointerLock();
  };

  const holdKey = (code: string, pressed: boolean) => {
    window.dispatchEvent(new KeyboardEvent(pressed ? "keydown" : "keyup", { code }));
  };

  const toggleSound = () => {
    const nextMuted = !mutedRef.current;
    mutedRef.current = nextMuted;
    setMuted(nextMuted);
    apiRef.current?.setMuted(nextMuted);
  };

  const heartDisplay = Array.from({ length: 3 }, (_, index) => (
    <span key={index} className={index < hearts ? "heart active" : "heart"} aria-hidden="true">
      ♥
    </span>
  ));

  return (
    <main className={`game-shell ${hurt ? "is-hurt" : ""}`}>
      <canvas ref={canvasRef} className="game-canvas" aria-label="Bubble Blaster 3D game arena" />

      <div className="sun-glow" aria-hidden="true" />

      <header className="hud hud-top" aria-label="Game status">
        <div className="brand-pill">
          <span className="brand-orb" aria-hidden="true">✦</span>
          <span>
            <strong>Bubble Blaster</strong>
            <small>Rainbow Rescue</small>
          </span>
        </div>

        <div className="scoreboard" aria-live="polite">
          <div className="stat">
            <span className="stat-label">Score</span>
            <strong>{score.toString().padStart(3, "0")}</strong>
          </div>
          <div className="stat timer-stat">
            <span className="stat-label">Time</span>
            <strong>{timeLeft}s</strong>
          </div>
          <div className="stat hearts-stat">
            <span className="stat-label">Shield</span>
            <span className="hearts" aria-label={`${hearts} shield hearts left`}>{heartDisplay}</span>
          </div>
        </div>

        <div className="quest-pill">
          <span className="wave-dot" aria-hidden="true" />
          <span><small>Round</small><strong>{wave} / 4</strong></span>
          <button
            type="button"
            className="sound-button"
            aria-label={muted ? "Turn sound on" : "Turn sound off"}
            onClick={toggleSound}
          >
            {muted ? "♩" : "♪"}
          </button>
        </div>
      </header>

      <div className="crosshair" aria-hidden="true"><span /></div>

      {phase === "playing" && (
        <div className="play-hints" aria-hidden="true">
          <span className="mission-chip">Bubble the Wigglies!</span>
          {streak >= 2 && <span className="streak-chip">{streak} pop streak! ✦</span>}
        </div>
      )}

      <div className="desktop-tip" aria-hidden="true">
        <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move</span>
        <span className="tip-divider" />
        <span><i className="mouse-icon" /> look &amp; bubble</span>
      </div>

      <div className="touch-controls" aria-label="Touch controls">
        <div className="move-pad">
          <button
            type="button"
            className="move-up"
            aria-label="Move forward"
            onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); holdKey("KeyW", true); }}
            onPointerUp={() => holdKey("KeyW", false)}
            onPointerCancel={() => holdKey("KeyW", false)}
          >↑</button>
          <button
            type="button"
            className="move-left"
            aria-label="Move left"
            onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); holdKey("KeyA", true); }}
            onPointerUp={() => holdKey("KeyA", false)}
            onPointerCancel={() => holdKey("KeyA", false)}
          >←</button>
          <button
            type="button"
            className="move-down"
            aria-label="Move backward"
            onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); holdKey("KeyS", true); }}
            onPointerUp={() => holdKey("KeyS", false)}
            onPointerCancel={() => holdKey("KeyS", false)}
          >↓</button>
          <button
            type="button"
            className="move-right"
            aria-label="Move right"
            onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); holdKey("KeyD", true); }}
            onPointerUp={() => holdKey("KeyD", false)}
            onPointerCancel={() => holdKey("KeyD", false)}
          >→</button>
        </div>
        <button
          type="button"
          className="bubble-button"
          aria-label="Shoot a bubble"
          onPointerDown={(event) => { event.stopPropagation(); apiRef.current?.shoot(); }}
        >
          <span>○</span>
          BUBBLE
        </button>
      </div>

      {phase === "intro" && (
        <section className="game-overlay" aria-labelledby="game-title">
          <div className="intro-card">
            <div className="eyebrow"><span>★</span> A friendly 3D adventure <span>★</span></div>
            <div className="hero-bubbles" aria-hidden="true">
              <span className="bubble-one" />
              <span className="bubble-two" />
              <span className="bubble-three">✦</span>
            </div>
            <h1 id="game-title"><span>Bubble</span> Blaster</h1>
            <p className="subtitle">Rainbow Rescue</p>
            <p className="intro-copy">
              The playful Wigglies have bounced into Sunny Park. Wrap them in bubbles
              and send them giggling home before time runs out!
            </p>
            <div className="how-to-play">
              <div><span className="how-icon lavender">↟</span><strong>Explore</strong><small>Move around the park</small></div>
              <div><span className="how-icon aqua">◉</span><strong>Aim</strong><small>Look for Wigglies</small></div>
              <div><span className="how-icon peach">○</span><strong>Bubble!</strong><small>Click or tap to pop</small></div>
            </div>
            <button type="button" className="primary-button" onClick={startGame}>
              <span>Play now</span><b aria-hidden="true">→</b>
            </button>
            <p className="safety-note">No ads · No sign-in · Plays offline</p>
          </div>
        </section>
      )}

      {phase === "paused" && (
        <section className="game-overlay compact-overlay" aria-labelledby="pause-title">
          <div className="result-card">
            <div className="result-icon" aria-hidden="true">☁</div>
            <p className="result-kicker">Little break</p>
            <h2 id="pause-title">Game paused</h2>
            <p>Your score and time are safe. Ready to jump back in?</p>
            <button type="button" className="primary-button" onClick={resumeGame}>
              <span>Keep playing</span><b aria-hidden="true">→</b>
            </button>
          </div>
        </section>
      )}

      {phase === "ended" && (
        <section className="game-overlay compact-overlay" aria-labelledby="result-title">
          <div className="result-card">
            <div className="result-icon medal" aria-hidden="true">★</div>
            <p className="result-kicker">Rainbow report</p>
            <h2 id="result-title">
              {endReason === "time" ? "Sparkly work!" : "The Wigglies got too close!"}
            </h2>
            <p>
              {endReason === "time"
                ? "Sunny Park is twinkling again."
                : "Your bubble shield needs a quick recharge."}
            </p>
            <div className="result-score">
              <div><small>Your score</small><strong>{score}</strong></div>
              <span />
              <div><small>Best score</small><strong>{Math.max(bestScore, score)}</strong></div>
            </div>
            <button type="button" className="primary-button" onClick={startGame}>
              <span>Play again</span><b aria-hidden="true">↻</b>
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
