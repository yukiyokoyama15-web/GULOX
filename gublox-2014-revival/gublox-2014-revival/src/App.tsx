import React, { useState, useEffect, useRef, Suspense } from 'react';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'motion/react';
import { Menu, MessageSquare, Briefcase, User, Settings, Flag, HelpCircle, Video, RotateCcw, LogOut, X, Download, Upload, FileText, Plus, Save, Globe, MousePointer2, Move, Maximize, Box, Palette, Circle, Layers, Lock, Anchor, Search, Wrench, Play, Pause, Square, Mic, MicOff, Link, Bot, Zap, Send, Sparkles } from 'lucide-react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, Sky, ContactShadows, Text, Billboard, TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import { GubloxLogo } from './components/GubloxLogo';
import { askAssistant } from './services/aiService';

// --- Tipos ---
interface AvatarConfig {
  headColor: string;
  torsoColor: string;
  armColor: string;
  legColor: string;
  hat: string | null;
  accessory: string | null;
  shirt: string | null;
  pants: string | null;
}

interface Player {
  id: string;
  x: number;
  y: number;
  jumpHeight: number;
  color: string;
  name: string;
  avatarConfig?: AvatarConfig;
  isDancing?: boolean;
}

interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: string;
}

// --- Componentes 3D ---
const lerpAngle = (a: number, b: number, t: number) => {
  const d = b - a;
  const normalizedD = ((d + Math.PI) % (Math.PI * 2)) - Math.PI;
  return a + normalizedD * t;
};

function AiAssistantModel({ playerPos }: { playerPos: { x: number, y: number, z: number } }) {
  const groupRef = useRef<THREE.Group>(null);
  
  useFrame((state) => {
    if (groupRef.current) {
      const t = state.clock.getElapsedTime();
      // Follow player with a slight delay and offset
      const targetX = playerPos.x + Math.sin(t) * 2;
      const targetZ = playerPos.z + Math.cos(t) * 2;
      const targetY = playerPos.y + 3 + Math.sin(t * 2) * 0.5;
      
      groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, targetX, 0.05);
      groupRef.current.position.z = THREE.MathUtils.lerp(groupRef.current.position.z, targetZ, 0.05);
      groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, targetY, 0.05);
      
      groupRef.current.rotation.y = t;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Floating Sparkle/Bot */}
      <mesh castShadow>
        <octahedronGeometry args={[0.5, 0]} />
        <meshStandardMaterial color="#00E5FF" emissive="#00E5FF" emissiveIntensity={2} />
      </mesh>
      <pointLight color="#00E5FF" intensity={1} distance={5} />
      
      {/* Orbiting bits */}
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[Math.sin(i * 2) * 0.8, Math.cos(i * 2) * 0.8, 0]}>
          <boxGeometry args={[0.1, 0.1, 0.1]} />
          <meshStandardMaterial color="#FFFFFF" />
        </mesh>
      ))}
    </group>
  );
}

function PlayerModel({ player, isMe, currentUser, onBan, isSuperMode }: { player: Player; isMe: boolean; currentUser: { username: string } | null; onBan: (playerId: string) => void; isSuperMode?: boolean }) {
  console.log("PlayerModel rendered");
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const prevPos = useRef({ x: player.x, y: player.y });
  const walkTime = useRef(0);
  const danceTime = useRef(0);
  const lastStepIndex = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const footstepAudio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (isMe) {
      footstepAudio.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3');
      footstepAudio.current.volume = 0.05;
    }
  }, [isMe]);

  useEffect(() => {
    if (player.isDancing) {
      if (!audioRef.current) {
        // Placeholder for the video's music. 
        // Replace this URL with the actual audio file URL from the video if available.
        audioRef.current = new Audio('https://ia800505.us.archive.org/15/items/MonsterMash_347/Monster%20Mash.mp3'); 
        audioRef.current.loop = true;
        audioRef.current.volume = 0.5;
      }
      audioRef.current.play().catch(e => console.log("Audio play failed", e));
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    }
    return () => {
      if (audioRef.current) audioRef.current.pause();
    }
  }, [player.isDancing]);

  useFrame((state, delta) => {
    if (groupRef.current && meshRef.current) {
      // Suavizar movimento
      const scale = isSuperMode ? 1.5 : 1.0;
      groupRef.current.scale.set(scale, scale, scale);
      
      groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, (player.x - 400) / 20, 0.1);
      groupRef.current.position.z = THREE.MathUtils.lerp(groupRef.current.position.z, (player.y - 300) / 20, 0.1);
      groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, player.jumpHeight || 0, 0.2);

      // Calcular velocidade e direção
      const dx = player.x - prevPos.current.x;
      const dy = player.y - prevPos.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const isMoving = distance > 0.05; // Mais sensível ao movimento

      if (isMoving) {
        // Velocidade da animação estável para um ciclo de exatamente 0.9s
        walkTime.current += delta * (Math.PI * 2 / 0.9); 
        
        // Efeito sonoro de passo (a cada 2 passos)
        if (isMe) {
          const stepIndex = Math.floor(walkTime.current / Math.PI);
          if (stepIndex !== lastStepIndex.current) {
            lastStepIndex.current = stepIndex;
            if (stepIndex % 2 === 0 && footstepAudio.current) {
              const clone = footstepAudio.current.cloneNode() as HTMLAudioElement;
              clone.volume = 0.03; // Bem sutil
              clone.play().catch(() => {});
            }
          }
        }
        
        const targetAngle = Math.atan2(dx, dy);
        // Rotação mais suave usando lerpAngle para evitar saltos de 360 graus
        meshRef.current.rotation.y = lerpAngle(meshRef.current.rotation.y, targetAngle, 0.15);
      } else {
        // Retorna gradualmente à posição de repouso
        walkTime.current = THREE.MathUtils.lerp(walkTime.current, 0, 0.1);
      }

      if (player.isDancing && !isMoving) {
        danceTime.current += delta;
        const t = danceTime.current;
        
        // Monster Mash Choreography - 4 Second Loop
        // Based on the stick figure reference video
        const cycleDuration = 4.0; 
        const localTime = t % cycleDuration;

        let targetLeftArmZ = 0, targetLeftArmX = 0;
        let targetRightArmZ = 0, targetRightArmX = 0;
        let targetBodyZ = 0;
        let targetBodyY = 1.5;
        let targetHeadZ = 0;
        let targetHeadX = 0;

        // Phase 1: 0.0s - 1.0s: Side Sway (Arms Low)
        if (localTime < 1.0) {
            const sway = Math.sin(localTime * Math.PI * 2); // One full sway cycle
            targetBodyZ = sway * 0.15;
            targetHeadZ = -sway * 0.2;
            
            // Arms low and swaying across body
            targetLeftArmZ = 0.4 + sway * 0.6;
            targetRightArmZ = -0.4 + sway * 0.6;
            targetLeftArmX = 0.2;
            targetRightArmX = 0.2;
            
            // Subtle rhythm bounce
            targetBodyY = 1.5 + Math.abs(Math.sin(localTime * Math.PI * 4)) * 0.05;
        } 
        // Phase 2: 1.0s - 2.0s: The Roll (Chest Level)
        else if (localTime < 2.0) {
            const rollTime = (localTime - 1.0) * Math.PI * 6; // Fast rotation
            targetLeftArmX = -1.2; 
            targetRightArmX = -1.2;
            
            // Hands rotating around each other in front of chest
            targetLeftArmZ = 0.6 + Math.sin(rollTime) * 0.4;
            targetRightArmZ = -0.6 + Math.cos(rollTime) * 0.4;
            
            targetBodyZ = Math.sin(rollTime * 0.5) * 0.05;
            targetBodyY = 1.5 + Math.abs(Math.sin(rollTime * 0.5)) * 0.03;
        }
        // Phase 3: 2.0s - 3.0s: The Open Pose (T-Pose / V-Shape)
        else if (localTime < 3.0) {
            // Sharp transition to open arms
            targetLeftArmZ = 2.4; 
            targetRightArmZ = -2.4;
            targetLeftArmX = 0;
            targetRightArmX = 0;
            
            // Look up slightly as in the video
            targetHeadX = -0.2;
            targetBodyZ = 0;
            targetBodyY = 1.5;
        }
        // Phase 4: 3.0s - 4.0s: High Arm Roll (Hands rotating above head)
        else {
            const rollTime = (localTime - 3.0) * Math.PI * 6;
            targetLeftArmX = -1.6; // Higher angle
            targetRightArmX = -1.6;
            
            targetLeftArmZ = 1.2 + Math.sin(rollTime) * 0.5;
            targetRightArmZ = -1.2 + Math.cos(rollTime) * 0.5;
            
            targetHeadZ = Math.sin(rollTime * 0.5) * 0.1;
            targetBodyY = 1.5 + Math.abs(Math.sin(rollTime * 0.5)) * 0.03;
        }

        // Apply Rotations with high-precision Lerp (0.1s feel)
        const lerpFactor = 0.25; 
        
        meshRef.current.position.y = THREE.MathUtils.lerp(meshRef.current.position.y, targetBodyY, lerpFactor);
        meshRef.current.rotation.z = THREE.MathUtils.lerp(meshRef.current.rotation.z, targetBodyZ, lerpFactor);
        // Garantir que X e Y não sejam afetados pela dança de forma indesejada (exceto Y que é controlado pelo movimento)
        meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, 0, lerpFactor);

        if (headRef.current) {
            headRef.current.rotation.x = THREE.MathUtils.lerp(headRef.current.rotation.x, targetHeadX, lerpFactor);
            headRef.current.rotation.z = THREE.MathUtils.lerp(headRef.current.rotation.z, targetHeadZ, lerpFactor);
        }

        if (leftArmRef.current) {
            leftArmRef.current.rotation.z = THREE.MathUtils.lerp(leftArmRef.current.rotation.z, targetLeftArmZ, lerpFactor);
            leftArmRef.current.rotation.x = THREE.MathUtils.lerp(leftArmRef.current.rotation.x, targetLeftArmX, lerpFactor);
        }
        if (rightArmRef.current) {
            rightArmRef.current.rotation.z = THREE.MathUtils.lerp(rightArmRef.current.rotation.z, targetRightArmZ, lerpFactor);
            rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, targetRightArmX, lerpFactor);
        }

        // Legs planted but with subtle knee bend/sway to match the stick figure
        const legSway = Math.sin(t * 4) * 0.05;
        if (leftLegRef.current) {
             leftLegRef.current.rotation.z = THREE.MathUtils.lerp(leftLegRef.current.rotation.z, legSway, 0.1);
             leftLegRef.current.rotation.x = THREE.MathUtils.lerp(leftLegRef.current.rotation.x, 0, 0.1);
        }
        if (rightLegRef.current) {
             rightLegRef.current.rotation.z = THREE.MathUtils.lerp(rightLegRef.current.rotation.z, legSway, 0.1);
             rightLegRef.current.rotation.x = THREE.MathUtils.lerp(rightLegRef.current.rotation.x, 0, 0.1);
        }

      } else {
        // Reset dance rotations
        meshRef.current.rotation.z = THREE.MathUtils.lerp(meshRef.current.rotation.z, 0, 0.2);
        meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, 0, 0.2);
        
        if (headRef.current) {
            headRef.current.rotation.x = THREE.MathUtils.lerp(headRef.current.rotation.x, 0, 0.2);
            headRef.current.rotation.z = THREE.MathUtils.lerp(headRef.current.rotation.z, 0, 0.2);
        }

        if (leftArmRef.current) leftArmRef.current.rotation.z = THREE.MathUtils.lerp(leftArmRef.current.rotation.z, 0, 0.2);
        if (rightArmRef.current) rightArmRef.current.rotation.z = THREE.MathUtils.lerp(rightArmRef.current.rotation.z, 0, 0.2);
        if (leftLegRef.current) leftLegRef.current.rotation.z = THREE.MathUtils.lerp(leftLegRef.current.rotation.z, 0, 0.2);
        if (rightLegRef.current) rightLegRef.current.rotation.z = THREE.MathUtils.lerp(rightLegRef.current.rotation.z, 0, 0.2);

        // Animação de andar (braços e pernas opostos)
        // Usar seno para movimento e bounce para evitar o "tremido" inicial
        const t = walkTime.current;
        const swingAngle = isMoving ? Math.sin(t) * 0.8 : 0; // Balanço mais largo (0.8)
        // Bounce suave que começa em 0 para evitar saltos (tremido)
        const bounce = isMoving ? Math.abs(Math.sin(t)) * 0.15 : 0; // Pulo mais alto (0.15)
        // Leve inclinação lateral (waddle) para dar mais vida
        const tilt = isMoving ? Math.sin(t * 0.5) * 0.08 : 0; // Gingado mais forte (0.08)
        
        const isJumping = (player.jumpHeight || 0) > 0.01;
        
        // Aplicar bounce e tilt no corpo
        meshRef.current.position.y = THREE.MathUtils.lerp(meshRef.current.position.y, 1.5 + bounce, 0.2);
        meshRef.current.rotation.z = THREE.MathUtils.lerp(meshRef.current.rotation.z, tilt, 0.2);
        // Leve inclinação para frente ao correr
        meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, isMoving ? 0.1 : 0, 0.1);

        // Interpolação mais suave para os membros
        if (leftArmRef.current) {
          const targetX = isJumping ? -3.0 : swingAngle;
          const targetZ = 0; // Removido o formato em V
          leftArmRef.current.rotation.x = THREE.MathUtils.lerp(leftArmRef.current.rotation.x, targetX, 0.2);
          leftArmRef.current.rotation.z = THREE.MathUtils.lerp(leftArmRef.current.rotation.z, targetZ, 0.2);
        }
        if (rightArmRef.current) {
          const targetX = isJumping ? -3.0 : -swingAngle;
          const targetZ = 0; // Removido o formato em V
          rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, targetX, 0.2);
          rightArmRef.current.rotation.z = THREE.MathUtils.lerp(rightArmRef.current.rotation.z, targetZ, 0.2);
        }
        if (leftLegRef.current) {
          const targetX = isJumping ? 0.4 : -swingAngle;
          leftLegRef.current.rotation.x = THREE.MathUtils.lerp(leftLegRef.current.rotation.x, targetX, 0.15);
        }
        if (rightLegRef.current) {
          const targetX = isJumping ? 0.4 : swingAngle;
          rightLegRef.current.rotation.x = THREE.MathUtils.lerp(rightLegRef.current.rotation.x, targetX, 0.15);
        }
      }

      prevPos.current = { x: player.x, y: player.y };
    }
  });

  return (
    <group ref={groupRef} onClick={(e) => {
      e.stopPropagation();
      if (currentUser?.username === 'Gustavo_japa30' && !isMe) {
        onBan(player.id);
      }
    }}>
      {/* Name Tag */}
      <Billboard position={[0, 4.5, 0]}>
        <Text
          fontSize={0.5}
          color="white"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.05}
          outlineColor="black"
        >
          {`${player.name}${isMe ? ' (Você)' : ''}${player.name === 'Gustavo_japa30' ? ' ⭐' : ''}`}
        </Text>
      </Billboard>

      {/* Gublox Character (Blocky 2014) */}
      <group ref={meshRef} position={[0, 1.5, 0]}>
        {/* Head Group */}
        <group ref={headRef} position={[0, 1.8, 0]}>
          {/* Head Mesh */}
          <mesh>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color={player.avatarConfig?.headColor || "#f5cd30"} />
          </mesh>
          
          {/* Hat */}
          {player.avatarConfig?.hat === 'cap' && (
            <group position={[0, 0.5, 0]}>
              <mesh position={[0, 0.1, 0]}>
                <boxGeometry args={[1.05, 0.3, 1.05]} />
                <meshStandardMaterial color="#ff0000" />
              </mesh>
              <mesh position={[0, 0.1, 0.4]}>
                <boxGeometry args={[1.05, 0.1, 0.8]} />
                <meshStandardMaterial color="#ff0000" />
              </mesh>
            </group>
          )}
          {player.avatarConfig?.hat === 'tophat' && (
            <group position={[0, 0.5, 0]}>
              <mesh position={[0, 0.1, 0]}>
                <cylinderGeometry args={[0.8, 0.8, 0.1, 12]} />
                <meshStandardMaterial color="#111111" />
              </mesh>
              <mesh position={[0, 0.6, 0]}>
                <cylinderGeometry args={[0.5, 0.5, 1, 12]} />
                <meshStandardMaterial color="#111111" />
              </mesh>
            </group>
          )}
          {player.avatarConfig?.hat === 'crown' && (
            <group position={[0, 0.5, 0]}>
              <mesh position={[0, 0.2, 0]}>
                <cylinderGeometry args={[0.5, 0.5, 0.4, 6]} />
                <meshStandardMaterial color="#f1c40f" />
              </mesh>
            </group>
          )}
          {player.avatarConfig?.hat === 'headphones' && (
            <group position={[0, 0.5, 0]}>
              <mesh position={[0, 0.3, 0]}>
                <boxGeometry args={[1.1, 0.1, 0.2]} />
                <meshStandardMaterial color="#2c3e50" />
              </mesh>
              <mesh position={[-0.55, 0, 0]}>
                <boxGeometry args={[0.2, 0.5, 0.5]} />
                <meshStandardMaterial color="#e74c3c" />
              </mesh>
              <mesh position={[0.55, 0, 0]}>
                <boxGeometry args={[0.2, 0.5, 0.5]} />
                <meshStandardMaterial color="#e74c3c" />
              </mesh>
            </group>
          )}

          {/* Accessory */}
          {player.avatarConfig?.accessory === 'glasses' && (
            <group position={[0, 0, 0.51]}>
              <mesh position={[-0.2, 0.1, 0]}>
                <boxGeometry args={[0.3, 0.2, 0.05]} />
                <meshStandardMaterial color="#2c3e50" />
              </mesh>
              <mesh position={[0.2, 0.1, 0]}>
                <boxGeometry args={[0.3, 0.2, 0.05]} />
                <meshStandardMaterial color="#2c3e50" />
              </mesh>
              <mesh position={[0, 0.1, 0]}>
                <boxGeometry args={[0.2, 0.05, 0.05]} />
                <meshStandardMaterial color="#2c3e50" />
              </mesh>
            </group>
          )}
          
          {/* Face (Eyes and Smile) */}
          <group position={[0, 0, 0.51]}>
            {/* Left Eye */}
            <mesh position={[-0.2, 0.1, 0]}>
              <boxGeometry args={[0.1, 0.2, 0.05]} />
              <meshBasicMaterial color="#000000" />
            </mesh>
            {/* Right Eye */}
            <mesh position={[0.2, 0.1, 0]}>
              <boxGeometry args={[0.1, 0.2, 0.05]} />
              <meshBasicMaterial color="#000000" />
            </mesh>
            {/* Smile Center */}
            <mesh position={[0, -0.2, 0]}>
              <boxGeometry args={[0.3, 0.08, 0.05]} />
              <meshBasicMaterial color="#000000" />
            </mesh>
            {/* Smile Left Edge */}
            <mesh position={[-0.15, -0.15, 0]}>
              <boxGeometry args={[0.08, 0.15, 0.05]} />
              <meshBasicMaterial color="#000000" />
            </mesh>
            {/* Smile Right Edge */}
            <mesh position={[0.15, -0.15, 0]}>
              <boxGeometry args={[0.08, 0.15, 0.05]} />
              <meshBasicMaterial color="#000000" />
            </mesh>
          </group>
        </group>

        {/* Accessory (Backpack stays on torso) */}
        {player.avatarConfig?.accessory === 'backpack' && (
          <mesh position={[0, 0.5, -0.6]}>
            <boxGeometry args={[1.2, 1.5, 0.4]} />
            <meshStandardMaterial color="#e74c3c" />
          </mesh>
        )}
        {/* Accessory (Ban Hammer) */}
        {player.avatarConfig?.accessory === 'banhammer' && (
          <group position={[0.8, 0.5, 0]}>
            <mesh position={[0, 0, 0]} rotation={[0, 0, -Math.PI / 4]}>
              <boxGeometry args={[0.2, 1.5, 0.2]} />
              <meshStandardMaterial color="#34495e" />
            </mesh>
            <mesh position={[0.5, 0.5, 0]}>
              <boxGeometry args={[0.6, 0.6, 0.6]} />
              <meshStandardMaterial color="#2c3e50" />
            </mesh>
          </group>
        )}

        {/* Torso */}
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[2, 2, 1]} />
          <meshStandardMaterial color={player.avatarConfig?.torsoColor || "#005eb8"} />
        </mesh>

        {/* Shirt */}
        {player.avatarConfig?.shirt === 'suit' && (
          <group position={[0, 0.5, 0]}>
            <mesh position={[0, 0, 0]}>
              <boxGeometry args={[2.05, 2.05, 1.05]} />
              <meshStandardMaterial color="#2c3e50" />
            </mesh>
            <mesh position={[0, 0.5, 0.53]}>
              <boxGeometry args={[0.6, 1, 0.05]} />
              <meshStandardMaterial color="#ecf0f1" />
            </mesh>
            <mesh position={[0, 0.3, 0.56]}>
              <boxGeometry args={[0.15, 0.8, 0.05]} />
              <meshStandardMaterial color="#c0392b" />
            </mesh>
          </group>
        )}
        {player.avatarConfig?.shirt === 'tshirt' && (
          <group position={[0, 0.5, 0]}>
            <mesh position={[0, 0, 0]}>
              <boxGeometry args={[2.05, 2.05, 1.05]} />
              <meshStandardMaterial color="#ecf0f1" />
            </mesh>
            <mesh position={[0, 0.2, 0.53]}>
              <boxGeometry args={[0.8, 0.8, 0.05]} />
              <meshStandardMaterial color="#3498db" />
            </mesh>
          </group>
        )}

        {/* Torso Logo (Left Chest) */}
        {player.avatarConfig?.shirt !== 'suit' && player.avatarConfig?.shirt !== 'tshirt' && (
          <Text
            position={[0.5, 1.0, 0.51]}
            fontSize={0.6}
            color="white"
            outlineWidth={0.08}
            outlineColor="#ff0000"
            fontWeight="bold"
            anchorX="center"
            anchorY="middle"
            rotation={[0, 0, 0.2]}
          >
            R
          </Text>
        )}
        
        {/* Left Arm */}
        <group position={[-1.5, 1.5, 0]} ref={leftArmRef}>
          <mesh position={[0, -1, 0]}>
            <boxGeometry args={[1, 2, 1]} />
            <meshStandardMaterial color={player.avatarConfig?.armColor || "#f5cd30"} />
          </mesh>
          {player.avatarConfig?.shirt === 'suit' && (
            <mesh position={[0, -1, 0]}>
              <boxGeometry args={[1.05, 2.05, 1.05]} />
              <meshStandardMaterial color="#2c3e50" />
            </mesh>
          )}
          {player.avatarConfig?.shirt === 'tshirt' && (
            <mesh position={[0, -0.5, 0]}>
              <boxGeometry args={[1.05, 1.05, 1.05]} />
              <meshStandardMaterial color="#ecf0f1" />
            </mesh>
          )}
        </group>
        
        {/* Right Arm */}
        <group position={[1.5, 1.5, 0]} ref={rightArmRef}>
          <mesh position={[0, -1, 0]}>
            <boxGeometry args={[1, 2, 1]} />
            <meshStandardMaterial color={player.avatarConfig?.armColor || "#f5cd30"} />
          </mesh>
          {player.avatarConfig?.shirt === 'suit' && (
            <mesh position={[0, -1, 0]}>
              <boxGeometry args={[1.05, 2.05, 1.05]} />
              <meshStandardMaterial color="#2c3e50" />
            </mesh>
          )}
          {player.avatarConfig?.shirt === 'tshirt' && (
            <mesh position={[0, -0.5, 0]}>
              <boxGeometry args={[1.05, 1.05, 1.05]} />
              <meshStandardMaterial color="#ecf0f1" />
            </mesh>
          )}
        </group>
        
        {/* Left Leg */}
        <group position={[-0.5, -0.5, 0]} ref={leftLegRef}>
          <mesh position={[0, -1, 0]}>
            <boxGeometry args={[1, 2, 1]} />
            <meshStandardMaterial color={player.avatarConfig?.legColor || "#a1c45a"} />
          </mesh>
          {player.avatarConfig?.pants === 'jeans' && (
            <mesh position={[0, -1, 0]}>
              <boxGeometry args={[1.05, 2.05, 1.05]} />
              <meshStandardMaterial color="#2980b9" />
            </mesh>
          )}
          {player.avatarConfig?.pants === 'shorts' && (
            <mesh position={[0, -0.5, 0]}>
              <boxGeometry args={[1.05, 1.05, 1.05]} />
              <meshStandardMaterial color="#8e44ad" />
            </mesh>
          )}
        </group>
        
        {/* Right Leg */}
        <group position={[0.5, -0.5, 0]} ref={rightLegRef}>
          <mesh position={[0, -1, 0]}>
            <boxGeometry args={[1, 2, 1]} />
            <meshStandardMaterial color={player.avatarConfig?.legColor || "#a1c45a"} />
          </mesh>
          {player.avatarConfig?.pants === 'jeans' && (
            <mesh position={[0, -1, 0]}>
              <boxGeometry args={[1.05, 2.05, 1.05]} />
              <meshStandardMaterial color="#2980b9" />
            </mesh>
          )}
          {player.avatarConfig?.pants === 'shorts' && (
            <mesh position={[0, -0.5, 0]}>
              <boxGeometry args={[1.05, 1.05, 1.05]} />
              <meshStandardMaterial color="#8e44ad" />
            </mesh>
          )}
        </group>
      </group>
    </group>
  );
}

function FollowCamera({ player }: { player: Player | undefined }) {
  console.log("FollowCamera rendered");
  const controlsRef = useRef<any>(null);
  const prevTarget = useRef(new THREE.Vector3());
  const newTarget = useRef(new THREE.Vector3());
  const offset = useRef(new THREE.Vector3());

  useFrame((state) => {
    if (!player) return;

    const targetX = (player.x - 400) / 20;
    const targetZ = (player.y - 300) / 20;
    const targetY = 1.5 + (player.jumpHeight || 0);
    
    newTarget.current.set(targetX, targetY, targetZ);

    if (controlsRef.current) {
      // Calcula o deslocamento do jogador desde o último frame
      offset.current.subVectors(newTarget.current, prevTarget.current);
      
      // Move a câmera junto com o jogador para manter a distância relativa
      state.camera.position.add(offset.current);
      
      // Atualiza o alvo para onde a câmera olha
      controlsRef.current.target.copy(newTarget.current);
      
      // Salva a posição atual para o próximo frame
      prevTarget.current.copy(newTarget.current);
    }
  });

  return (
    <OrbitControls 
      ref={controlsRef}
      makeDefault 
      minPolarAngle={0} 
      maxPolarAngle={Math.PI / 2.1} 
      enablePan={false} // Desativar Pan para focar no seguimento
      mouseButtons={{
        LEFT: THREE.MOUSE.ROTATE, // Inverter para facilitar a rotação
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE
      }}
    />
  );
}

function GameWorld({ players, myId, parts, currentUser, onBan, isSuperMode }: { players: Record<string, Player>; myId: string | null; parts: StudioPart[], currentUser: { username: string } | null, onBan: (playerId: string) => void; isSuperMode: boolean }) {
  const me = myId ? players[myId] : undefined;

  return (
    <>
      <Sky sunPosition={[100, 20, 100]} />
      <Stars radius={100} depth={50} count={2000} factor={4} saturation={0} fade speed={1} />
      <ambientLight intensity={0.7} />
      <pointLight position={[10, 10, 10]} intensity={1.5} castShadow />
      
      {/* AI Assistant Model */}
      {me && <AiAssistantModel playerPos={{ x: (me.x - 400) / 20, y: me.jumpHeight || 0, z: (me.y - 300) / 20 }} />}

      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]} receiveShadow>
        <planeGeometry args={[1000, 1000]} />
        <meshStandardMaterial color="#5a5a5a" />
      </mesh>
      <gridHelper args={[1000, 100, "#444", "#333"]} position={[0, -0.99, 0]} />

      {/* Map Parts */}
      {parts && parts.map((part) => (
        <mesh 
          key={part.id}
          castShadow 
          receiveShadow 
          position={part.position}
          rotation={part.rotation}
          scale={part.scale}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={part.color} />
        </mesh>
      ))}

      {/* Players */}
      {Object.values(players).map((player) => (
        <PlayerModel 
          key={player.id} 
          player={player} 
          isMe={player.id === myId} 
          currentUser={currentUser} 
          onBan={onBan} 
          isSuperMode={player.id === myId ? isSuperMode : false}
        />
      ))}

      <ContactShadows position={[0, -0.98, 0]} opacity={0.4} scale={20} blur={2} far={4.5} resolution={256} />
      <FollowCamera player={me} />
    </>
  );
}

// --- Componentes ---

interface StudioPart {
  id: string;
  name: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
  material: string;
  anchored: boolean;
}

// --- Studio Components ---
function Studio3DViewport({ 
  parts, 
  selectedId, 
  onSelect, 
  activeTool,
  onUpdatePart,
  onDeletePart
}: { 
  parts: StudioPart[], 
  selectedId: string | null, 
  onSelect: (id: string | null) => void,
  activeTool: 'select' | 'move' | 'scale' | 'rotate' | 'ban',
  onUpdatePart: (id: string, updates: Partial<StudioPart>) => void,
  onDeletePart: (id: string) => void
}) {
  const selectedPart = parts.find(p => p.id === selectedId);

  return (
    <Canvas 
      shadows 
      camera={{ position: [50, 50, 50], fov: 45 }} 
      onPointerMissed={() => onSelect(null)}
      dpr={[1, 1.5]}
      performance={{ min: 0.5 }}
    >
      <Sky sunPosition={[100, 20, 100]} />
      <Stars radius={100} depth={50} count={2000} factor={4} saturation={0} fade speed={1} />
      <ambientLight intensity={0.5} />
      <pointLight position={[100, 100, 100]} castShadow intensity={1} />
      <directionalLight 
        position={[50, 50, 50]} 
        castShadow 
        intensity={1.5} 
        shadow-camera-left={-100}
        shadow-camera-right={100}
        shadow-camera-top={100}
        shadow-camera-bottom={-100}
      />
      
      {/* Baseplate */}
      <mesh receiveShadow position={[0, -0.5, 0]}>
        <boxGeometry args={[200, 1, 200]} />
        <meshStandardMaterial color="#A3A2A5" />
      </mesh>
      
      {/* Grid Helper */}
      <gridHelper args={[200, 40, "#ffffff", "#555555"]} position={[0, 0.01, 0]} />
      
      {parts.map((part) => (
        <mesh 
          key={part.id}
          castShadow 
          receiveShadow 
          position={part.position}
          rotation={part.rotation}
          scale={part.scale}
          onClick={(e) => {
            e.stopPropagation();
            if (activeTool === 'ban') {
              onDeletePart(part.id);
            } else {
              onSelect(part.id);
            }
          }}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={part.color} />
        </mesh>
      ))}

      {selectedPart && activeTool !== 'select' && (
        <TransformControls 
          object={undefined} // We'll use the ref-less approach or find the object
          mode={activeTool === 'move' ? 'translate' : activeTool === 'rotate' ? 'rotate' : 'scale'}
          onMouseUp={(e: any) => {
            // Update the part in state when manipulation ends
            if (e?.target?.object) {
              const obj = e.target.object;
              onUpdatePart(selectedPart.id, {
                position: [obj.position.x, obj.position.y, obj.position.z],
                rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
                scale: [obj.scale.x, obj.scale.y, obj.scale.z]
              });
            }
          }}
        >
          <mesh 
            position={selectedPart.position}
            rotation={selectedPart.rotation}
            scale={selectedPart.scale}
          >
            <boxGeometry args={[1.01, 1.01, 1.01]} />
            <meshStandardMaterial transparent opacity={0} />
          </mesh>
        </TransformControls>
      )}

      {/* Spawn Point Visual */}
      <mesh position={[10, 0.05, 10]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[8, 8]} />
        <meshStandardMaterial color="#64C291" transparent opacity={0.8} />
      </mesh>
      <mesh position={[10, 0.1, 10]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.5, 4, 32]} />
        <meshStandardMaterial color="white" />
      </mesh>

      <OrbitControls makeDefault enabled={activeTool === 'select' || !selectedPart} />
      <ContactShadows opacity={0.4} scale={100} blur={2} far={10} resolution={256} color="#000000" />
    </Canvas>
  );
}

export default function App() {
  const [gameState, setGameState] = useState<'home' | 'dashboard' | 'playing' | 'avatar' | 'welcome' | 'create_login' | 'create_dashboard' | 'gublox_studio'>('home');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [myId, setMyId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<{ username: string; id: number } | null>(null);
  const [gubux, setGubux] = useState(0);
  const [isGubuxModalOpen, setIsGubuxModalOpen] = useState(false);
  const [userMaps, setUserMaps] = useState<{ id: string; name: string; published: boolean; parts: StudioPart[] }[]>([
    { id: '1', name: 'Meu Primeiro Mapa', published: true, parts: [{ id: 'base-part', name: 'Part', position: [0, 2.5, 0], rotation: [0, 0, 0], scale: [5, 5, 5], color: '#00A2FF', material: 'Plastic', anchored: true }] },
    { id: '2', name: 'Baseplate', published: false, parts: [] }
  ]);
  const [currentEditingMap, setCurrentEditingMap] = useState<string | null>(null);
  const [currentPlayingMap, setCurrentPlayingMap] = useState<string | null>(null);
  const [studioParts, setStudioParts] = useState<StudioPart[]>([
    { id: 'base-part', name: 'Part', position: [0, 2.5, 0], rotation: [0, 0, 0], scale: [5, 5, 5], color: '#00A2FF', material: 'Plastic', anchored: true }
  ]);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [activeStudioTool, setActiveStudioTool] = useState<'select' | 'move' | 'scale' | 'rotate' | 'ban'>('select');
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mapId = params.get('mapId');
    if (mapId) {
      const map = userMaps.find(m => m.id === mapId);
      if (map && map.published) {
        setCurrentPlayingMap(mapId);
        setGameState('playing');
      }
    }
  }, []); // Run once on mount

  // Avatar states
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig>({
    headColor: '#f5cd30',
    torsoColor: '#005eb8',
    armColor: '#f5cd30',
    legColor: '#4b974b',
    hat: null,
    accessory: null,
    shirt: null,
    pants: null
  });

  const handleBan = (playerId: string) => {
    socketRef.current?.emit('banPlayer', playerId);
  };

  const handlePayment = async (amount: number, paymentMethod: string) => {
    try {
      const response = await fetch('/api/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, paymentMethod }),
      });
      const data = await response.json();
      if (data.error) {
        alert('Erro no pagamento: ' + data.error);
      } else {
        alert('Pagamento iniciado com sucesso!');
        console.log('Pagamento:', data);
      }
    } catch (error) {
      console.error('Erro:', error);
      alert('Erro ao processar pagamento');
    }
  };

  // Voice Chat states
  const [isMuted, setIsMuted] = useState(true);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({});

  // Chat states
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatFocused, setIsChatFocused] = useState(false);
  const [isChatVisible, setIsChatVisible] = useState(true);
  const [friendRequest, setFriendRequest] = useState<{ fromId: string; fromName: string } | null>(null);
  const [friends, setFriends] = useState<string[]>([]);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Form states
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [birthday, setBirthday] = useState({ month: '', day: '', year: '' });
  const [gender, setGender] = useState<'male' | 'female' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [authMode, setAuthMode] = useState<'signup' | 'login'>('signup');
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);
  const [aiMessages, setAiMessages] = useState<{ role: 'user' | 'assistant', text: string }[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isSuperMode, setIsSuperMode] = useState(false);

  const handleAiMessage = async (msg?: string) => {
    const userMsg = msg || aiInput.trim();
    if (!userMsg || isAiLoading) return;
    
    setAiMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setAiInput('');
    setIsAiLoading(true);

    const context = `O jogador atual é ${currentUser?.username || 'Visitante'}. O jogo está no estado ${gameState}. Super Mode: ${isSuperMode ? 'Ativado' : 'Desativado'}.`;
    const response = await askAssistant(userMsg, context);
    
    setAiMessages(prev => [...prev, { role: 'assistant', text: response }]);
    setIsAiLoading(false);
    
    // Check for commands in AI response
    const lowerResponse = response.toLowerCase();
    if (lowerResponse.includes("ativar super mode") || lowerResponse.includes("super modo ativado")) {
      setIsSuperMode(true);
    } else if (lowerResponse.includes("desativar super mode") || lowerResponse.includes("super modo desativado")) {
      setIsSuperMode(false);
    }
    
    if (lowerResponse.includes("pular") || lowerResponse.includes("jump")) {
      performJump();
    }

    if (lowerResponse.includes("mudar cor para") || lowerResponse.includes("change color to")) {
      const colors: Record<string, string> = {
        'vermelho': '#ff0000', 'red': '#ff0000',
        'azul': '#0000ff', 'blue': '#0000ff',
        'verde': '#00ff00', 'green': '#00ff00',
        'amarelo': '#ffff00', 'yellow': '#ffff00',
        'roxo': '#800080', 'purple': '#800080',
        'rosa': '#ffc0cb', 'pink': '#ffc0cb',
        'preto': '#000000', 'black': '#000000',
        'branco': '#ffffff', 'white': '#ffffff'
      };
      
      for (const [name, hex] of Object.entries(colors)) {
        if (lowerResponse.includes(name)) {
          setAvatarConfig(prev => ({ ...prev, torsoColor: hex }));
          break;
        }
      }
    }
  };

  const toggleSuperMode = () => {
    setIsSuperMode(prev => !prev);
    const msg = isSuperMode ? "Desativando Super Modo!" : "Ativando Super Modo! Agora sou rápido e forte!";
    setChatMessages(prev => [...prev, {
      id: Date.now().toString(),
      sender: "SISTEMA",
      text: msg,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }]);
  };

  // Mobile Joystick state
  const joystickRef = useRef({ active: false, origin: { x: 0, y: 0 }, current: { x: 0, y: 0 } });
  const [joystickUI, setJoystickUI] = useState({ active: false, origin: { x: 0, y: 0 }, current: { x: 0, y: 0 } });
  const joystickVector = useRef({ x: 0, y: 0 });
  const joystickTouchId = useRef<number | null>(null);

  const performJump = () => {
    if (gameState !== 'playing' || !myId) return;
    const me = players[myId];
    if (!me || me.jumpHeight > 0) return;

    // Tocar som de pulo
    const jumpAudio = new Audio('https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3');
    jumpAudio.volume = 0.2;
    jumpAudio.play().catch(err => console.log('Audio play failed:', err));

    // Iniciar Pulo
    let h = 0;
    let vel = 1.2; // Velocidade inicial aumentada para ser "forte"
    const gravity = 0.15;
    
    const jumpInterval = setInterval(() => {
      h += vel;
      vel -= gravity;
      
      if (h <= 0) {
        h = 0;
        clearInterval(jumpInterval);
      }
      
      setPlayers((prev) => {
        const meNow = prev[myId];
        if (!meNow) return prev;
        const updated = { ...meNow, jumpHeight: h };
        socketRef.current?.emit('playerMovement', { x: updated.x, y: updated.y, jumpHeight: h });
        return { ...prev, [myId]: updated };
      });
    }, 30);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.clientX < window.innerWidth / 2 && joystickTouchId.current === null) {
        joystickTouchId.current = touch.identifier;
        const newState = {
          active: true,
          origin: { x: touch.clientX, y: touch.clientY },
          current: { x: touch.clientX, y: touch.clientY }
        };
        joystickRef.current = newState;
        setJoystickUI(newState);
        joystickVector.current = { x: 0, y: 0 };
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (joystickTouchId.current === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === joystickTouchId.current) {
        const origin = joystickRef.current.origin;
        const dx = touch.clientX - origin.x;
        const dy = touch.clientY - origin.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const maxRadius = 40;
        
        let nx = dx;
        let ny = dy;
        if (distance > maxRadius) {
          nx = (dx / distance) * maxRadius;
          ny = (dy / distance) * maxRadius;
        }
        
        const newState = {
          ...joystickRef.current,
          current: { x: origin.x + nx, y: origin.y + ny }
        };
        joystickRef.current = newState;
        setJoystickUI(newState);
        
        joystickVector.current = {
          x: nx / maxRadius,
          y: ny / maxRadius
        };
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === joystickTouchId.current) {
        joystickTouchId.current = null;
        const newState = { active: false, origin: { x: 0, y: 0 }, current: { x: 0, y: 0 } };
        joystickRef.current = newState;
        setJoystickUI(newState);
        joystickVector.current = { x: 0, y: 0 };
      }
    }
  };

  const handleLogin = async () => {
    if (!username || !password) {
      setError('Por favor, preencha usuário e senha.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok) {
        setCurrentUser({ username: data.username, id: data.userId });
        setGubux(data.gubux);
        setGameState('welcome');
      } else {
        setError(data.error || 'Erro ao fazer login.');
      }
    } catch (err) {
      setError('Erro de conexão com o servidor.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!username || !password) {
      setError('Por favor, preencha usuário e senha.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          birthday: `${birthday.month}/${birthday.day}/${birthday.year}`,
          gender,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setCurrentUser({ username: data.username, id: data.userId });
        setGameState('welcome');
      } else {
        setError(data.error || 'Erro ao cadastrar.');
      }
    } catch (err) {
      setError('Erro de conexão com o servidor.');
    } finally {
      setIsLoading(false);
    }
  };
  const gameContainerRef = useRef<HTMLDivElement>(null);

  // Welcome Animation Timer
  useEffect(() => {
    if (gameState === 'welcome') {
      const timer = setTimeout(() => {
        setGameState('dashboard');
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [gameState]);

  // Conectar ao servidor
  useEffect(() => {
    if (gameState === 'playing') {
      let socket: Socket | null = null;

      const initConnection = () => {
        socket = io();
        socketRef.current = socket;

        const createPeerConnection = (targetId: string) => {
          const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
          });

          if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current!));
          }

          pc.onicecandidate = (event) => {
            if (event.candidate && socket) {
              socket.emit('webrtc-ice-candidate', { to: targetId, candidate: event.candidate });
            }
          };

          pc.ontrack = (event) => {
            let audioEl = document.getElementById(`audio-${targetId}`) as HTMLAudioElement;
            if (!audioEl) {
              audioEl = document.createElement('audio');
              audioEl.id = `audio-${targetId}`;
              audioEl.autoplay = true;
              document.body.appendChild(audioEl);
            }
            audioEl.srcObject = event.streams[0];
          };

          peerConnectionsRef.current[targetId] = pc;
          return pc;
        };

        socket.on('connect', () => {
          setMyId(socket!.id || null);
          if (currentUser) {
            socket!.emit('setPlayerName', currentUser.username);
          }
          socket!.emit('updateAvatar', avatarConfig);
        });

        socket.on('currentPlayers', (serverPlayers: Record<string, Player>) => {
          setPlayers(serverPlayers);
          // Initiate offers to existing players
          Object.keys(serverPlayers).forEach(async (id) => {
            if (id !== socket!.id) {
              const pc = createPeerConnection(id);
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              socket!.emit('webrtc-offer', { to: id, offer });
            }
          });
        });

        socket.on('newPlayer', (player: Player) => {
          setPlayers((prev) => ({ ...prev, [player.id]: player }));
        });

        socket.on('playerMoved', (player: Player) => {
          setPlayers((prev) => ({ ...prev, [player.id]: player }));
        });

        socket.on('playerDisconnected', (id: string) => {
          setPlayers((prev) => {
            const newPlayers = { ...prev };
            delete newPlayers[id];
            return newPlayers;
          });
          const pc = peerConnectionsRef.current[id];
          if (pc) {
            pc.close();
            delete peerConnectionsRef.current[id];
          }
          const audioEl = document.getElementById(`audio-${id}`);
          if (audioEl) audioEl.remove();
        });

        socket.on('webrtc-offer', async (data: { from: string, offer: any }) => {
          const pc = createPeerConnection(data.from);
          await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket!.emit('webrtc-answer', { to: data.from, answer });
        });

        socket.on('webrtc-answer', async (data: { from: string, answer: any }) => {
          const pc = peerConnectionsRef.current[data.from];
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          }
        });

        socket.on('webrtc-ice-candidate', async (data: { from: string, candidate: any }) => {
          const pc = peerConnectionsRef.current[data.from];
          if (pc) {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          }
        });

        socket.on('chatMessage', (message: ChatMessage) => {
          setChatMessages((prev) => [...prev, message]);
          // Auto-scroll chat
          setTimeout(() => {
            if (chatContainerRef.current) {
              chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
            }
          }, 50);
        });

        socket.on('friendRequestReceived', (data: { fromId: string; fromName: string }) => {
          setFriendRequest(data);
        });

        socket.on('friendRequestResult', (data: { responderId: string; responderName: string; accepted: boolean }) => {
          const msg = {
            id: Date.now().toString(),
            sender: 'System',
            text: `${data.responderName} ${data.accepted ? 'accepted' : 'declined'} your friend request.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };
          setChatMessages((prev) => [...prev, msg]);
          
          if (data.accepted) {
            setFriends((prev) => [...prev, data.responderId]);
          }
        });
      };

      navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        localStreamRef.current = stream;
        stream.getAudioTracks()[0].enabled = !isMuted;
      }).catch(err => {
        console.error("Mic error:", err);
        setIsMuted(true); // Reverter para mutado se falhar
      }).finally(() => {
        initConnection();
      });

      return () => {
        if (socket) socket.disconnect();
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(t => t.stop());
          localStreamRef.current = null;
        }
        Object.values(peerConnectionsRef.current).forEach(pc => pc.close());
        peerConnectionsRef.current = {};
        document.querySelectorAll('audio[id^="audio-"]').forEach(el => el.remove());
      };
    }
  }, [gameState]);

  useEffect(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
      });
    } else if (!isMuted && gameState === 'playing') {
      // Tentar obter permissão se ainda não tiver
      navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        localStreamRef.current = stream;
        stream.getAudioTracks()[0].enabled = true;
        
        // Adicionar a nova stream às conexões existentes
        Object.values(peerConnectionsRef.current).forEach(pc => {
          stream.getTracks().forEach(track => pc.addTrack(track, stream));
        });
      }).catch(err => {
        console.error("Mic error:", err);
        setIsMuted(true); // Reverter para mutado se falhar
      });
    }
  }, [isMuted, gameState]);

  // Movimentação do jogador (Joystick)
  useEffect(() => {
    if (gameState !== 'playing' || !myId) return;
    
    const speed = isSuperMode ? 30 : 15; // Super Mode makes it faster
    const interval = setInterval(() => {
      if (joystickVector.current.x !== 0 || joystickVector.current.y !== 0) {
        setPlayers((prev) => {
          const meNow = prev[myId];
          if (!meNow) return prev;
          
          let newX = meNow.x + joystickVector.current.x * speed;
          let newY = meNow.y + joystickVector.current.y * speed;
          
          newX = Math.max(0, Math.min(newX, 800));
          newY = Math.max(0, Math.min(newY, 600));
          
          if (newX !== meNow.x || newY !== meNow.y) {
            const updated = { ...meNow, x: newX, y: newY, isDancing: false };
            socketRef.current?.emit('playerMovement', { x: newX, y: newY, jumpHeight: updated.jumpHeight });
            return { ...prev, [myId]: updated };
          }
          return prev;
        });
      }
    }, 50);
    
    return () => clearInterval(interval);
  }, [gameState, myId]);

  // Movimentação do jogador (Teclado)
  useEffect(() => {
    if (gameState !== 'playing' || !myId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Focus chat on '/'
      if (e.key === '/' && !isChatFocused && isChatVisible) {
        e.preventDefault();
        const chatInputEl = document.getElementById('chat-input');
        if (chatInputEl) chatInputEl.focus();
        return;
      }

      if (isMenuOpen || isChatFocused) return;
      
      const speed = 15; // Aumentado de 12 para 15 (mais rápido)
      const me = players[myId];
      if (!me) return;

      if (e.code === 'Space' && me.jumpHeight === 0) {
        performJump();
        return;
      }

      let newX = me.x;
      let newY = me.y;

      const key = e.key.toLowerCase();
      if (key === 'w' || e.key === 'ArrowUp') newY -= speed;
      if (key === 's' || e.key === 'ArrowDown') newY += speed;
      if (key === 'a' || e.key === 'ArrowLeft') newX -= speed;
      if (key === 'd' || e.key === 'ArrowRight') newX += speed;

      // Limites simples
      newX = Math.max(0, Math.min(newX, 800));
      newY = Math.max(0, Math.min(newY, 600));

      if (newX !== me.x || newY !== me.y) {
        setPlayers((prev) => {
          const meNow = prev[myId];
          if (!meNow) return prev;
          const updated = { ...meNow, x: newX, y: newY, isDancing: false };
          socketRef.current?.emit('playerMovement', { x: newX, y: newY, jumpHeight: updated.jumpHeight });
          return { ...prev, [myId]: updated };
        });
      }
    };

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isChatFocused) {
          const chatInputEl = document.getElementById('chat-input');
          if (chatInputEl) chatInputEl.blur();
        } else {
          setIsMenuOpen((prev) => !prev);
        }
      }
      if (isMenuOpen && e.key.toLowerCase() === 'r') {
        handleResetCharacter();
      }
      if (isMenuOpen && e.key.toLowerCase() === 'l') {
        setGameState('home');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [gameState, myId, players, isMenuOpen, isChatFocused]);

  const handleResetCharacter = () => {
    if (!myId || !socketRef.current) return;
    
    // Reset to center
    const newX = 400;
    const newY = 300;
    
    setPlayers((prev) => {
      const meNow = prev[myId];
      if (!meNow) return prev;
      const updated = { ...meNow, x: newX, y: newY, jumpHeight: 0 };
      socketRef.current?.emit('playerMovement', { x: newX, y: newY, jumpHeight: 0 });
      return { ...prev, [myId]: updated };
    });
    
    setIsMenuOpen(false);
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatInput.trim() && socketRef.current) {
      if (chatInput.trim().toLowerCase() === '/dance') {
        socketRef.current.emit('playerDance', true);
        setChatInput('');
        return;
      }
      socketRef.current.emit('chatMessage', chatInput.trim());
      setChatInput('');
    }
  };

  const handleSendFriendRequest = (targetId: string) => {
    if (socketRef.current) {
      socketRef.current.emit('sendFriendRequest', targetId);
      // Optional: Add a local chat message confirming the request was sent
      const msg = {
        id: Date.now().toString(),
        sender: 'System',
        text: `Friend request sent to player.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setChatMessages((prev) => [...prev, msg]);
    }
  };

  const handleFriendRequestResponse = (accepted: boolean) => {
    if (friendRequest && socketRef.current) {
      socketRef.current.emit('friendRequestResponse', { fromId: friendRequest.fromId, accepted });
      if (accepted) {
        setFriends((prev) => [...prev, friendRequest.fromId]);
      }
      setFriendRequest(null);
    }
  };

  // --- Componentes ---

  if (gameState === 'welcome') {
    return (
      <motion.div 
        className="min-h-screen bg-gradient-to-br from-red-500 to-red-700 flex flex-col items-center justify-center overflow-hidden relative"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Welcome Text: Left -> Right */}
        <motion.div
          className="absolute top-[15%] text-white text-6xl md:text-8xl font-light tracking-[0.2em] uppercase font-sans drop-shadow-lg whitespace-nowrap"
          initial={{ x: "-100vw", opacity: 0 }}
          animate={{ 
            x: ["-100vw", "-10vw", "10vw", "100vw"],
            opacity: [0, 1, 1, 0]
          }}
          transition={{ 
            duration: 4, 
            times: [0, 0.35, 0.65, 1],
            ease: "easeInOut"
          }}
        >
          Welcome
        </motion.div>

        {/* Gublox Logo: Right -> Left */}
        <motion.div
          className="absolute bottom-[30%]"
          initial={{ x: "100vw", opacity: 0 }}
          animate={{ 
            x: ["100vw", "10vw", "-10vw", "-100vw"],
            opacity: [0, 1, 1, 0]
          }}
          transition={{ 
            duration: 4, 
            times: [0, 0.35, 0.65, 1],
            ease: "easeInOut"
          }}
        >
          <GubloxLogo className="h-40 md:h-64 drop-shadow-2xl" color="white" />
        </motion.div>
      </motion.div>
    );
  }

  if (gameState === 'create_login') {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white font-sans">
        <div className="w-full max-w-md p-8 bg-[#1B1D1F] rounded-lg shadow-2xl border border-white/10">
          <div className="flex justify-center mb-8">
            <GubloxLogo className="h-12" color="white" />
          </div>
          <h1 className="text-2xl font-bold mb-6 text-center">Login no Gublox Studio</h1>
          <p className="text-gray-400 text-sm mb-8 text-center">Entre com sua conta do Gublox para começar a criar.</p>
          
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Usuário</label>
              <input 
                type="text" 
                defaultValue={currentUser?.username || ""}
                className="w-full bg-[#2D2F31] border border-white/10 p-3 rounded text-sm focus:outline-none focus:border-[#00A2FF]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Senha</label>
              <input 
                type="password" 
                defaultValue="********"
                className="w-full bg-[#2D2F31] border border-white/10 p-3 rounded text-sm focus:outline-none focus:border-[#00A2FF]"
              />
            </div>
            <button 
              onClick={() => setGameState('create_dashboard')}
              className="w-full bg-[#00A2FF] hover:bg-[#008CE6] text-white font-bold py-3 rounded transition-colors mt-4"
            >
              Entrar
            </button>
            <button 
              onClick={() => setGameState('dashboard')}
              className="w-full text-gray-500 text-sm hover:underline mt-2"
            >
              Voltar para o Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'create_dashboard') {
    return (
      <div className="min-h-screen bg-[#2D2F31] text-white font-sans flex flex-col">
        {/* Header */}
        <div className="h-12 bg-[#1B1D1F] flex items-center px-4 border-b border-white/10">
          <GubloxLogo className="h-6 mr-8" color="white" variant="simple" />
          <div className="flex space-x-6 text-sm font-bold">
            <button className="text-[#00A2FF] border-b-2 border-[#00A2FF] pb-3 mt-3">Meus Mapas</button>
            <button className="text-gray-400 hover:text-white pb-3 mt-3">Modelos</button>
            <button className="text-gray-400 hover:text-white pb-3 mt-3">Plugins</button>
          </div>
          <div className="ml-auto flex items-center space-x-4">
             <button 
               onClick={() => setGameState('dashboard')}
               className="text-xs text-gray-400 hover:text-white"
             >
               Sair
             </button>
          </div>
        </div>

        <div className="flex-1 p-8">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <h1 className="text-2xl font-bold">Meus Mapas</h1>
              <button 
                onClick={() => {
                  const newId = (userMaps.length + 1).toString();
                  setUserMaps([...userMaps, { id: newId, name: 'Novo Mapa', published: false, parts: [] }]);
                  setCurrentEditingMap(newId);
                  setStudioParts([]);
                  setGameState('gublox_studio');
                }}
                className="bg-[#00A2FF] hover:bg-[#008CE6] text-white px-6 py-2 rounded font-bold flex items-center"
              >
                <Plus size={18} className="mr-2" /> Criar Novo Mapa
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {userMaps.map(map => (
                <div key={map.id} className="bg-[#1B1D1F] border border-white/5 rounded-lg overflow-hidden hover:border-white/20 transition-all group">
                  <div className="aspect-video bg-gray-800 relative">
                    <img src={`https://picsum.photos/seed/map-${map.id}/400/225`} alt="Map" className="w-full h-full object-cover opacity-60" referrerPolicy="no-referrer" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => {
                          setCurrentEditingMap(map.id);
                          setStudioParts(map.parts || []);
                          setGameState('gublox_studio');
                        }}
                        className="bg-white text-black px-4 py-2 rounded-full text-sm font-bold shadow-lg"
                      >
                        Editar no Gublox Studio
                      </button>
                    </div>
                  </div>
                  <div className="p-4 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold">{map.name}</h3>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">
                        {map.published ? 'Publicado' : 'Privado'}
                      </p>
                    </div>
                    <div className="flex space-x-2">
                       <button 
                         onClick={() => {
                           const url = `${window.location.origin}?mapId=${map.id}`;
                           navigator.clipboard.writeText(url);
                           alert('Link do mapa copiado!');
                         }}
                         className="p-2 hover:bg-white/5 rounded text-gray-400"
                         title="Copiar Link"
                       >
                         <Link size={16} />
                       </button>
                       <button className="p-2 hover:bg-white/5 rounded text-gray-400"><Settings size={16} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'gublox_studio') {
    const currentMap = userMaps.find(m => m.id === currentEditingMap);
    
    const handleSaveLocal = () => {
      const content = JSON.stringify({ mapName: currentMap?.name, version: "2014", parts: studioParts });
      const blob = new Blob([content], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentMap?.name || 'map'}.rbxl`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      alert('Mapa salvo no seu PC como .rbxl!');
    };

    const handlePublish = () => {
      if (currentEditingMap) {
        setUserMaps(prev => prev.map(m => m.id === currentEditingMap ? { ...m, published: true, parts: studioParts } : m));
        alert('Mapa publicado com sucesso! Agora ele aparecerá no Dashboard.');
      }
    };

    const handleAddPart = () => {
      const newPart: StudioPart = {
        id: Math.random().toString(36).substr(2, 9),
        name: 'Part',
        position: [0, 5, 0],
        rotation: [0, 0, 0],
        scale: [4, 4, 4],
        color: '#A3A2A5',
        material: 'Plastic',
        anchored: true
      };
      setStudioParts([...studioParts, newPart]);
      setSelectedPartId(newPart.id);
    };

    const handleUpdatePart = (id: string, updates: Partial<StudioPart>) => {
      setStudioParts(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
    };

    const handleDeletePart = (id: string) => {
      setStudioParts(prev => prev.filter(p => p.id !== id));
      if (selectedPartId === id) setSelectedPartId(null);
    };

    const selectedPart = studioParts.find(p => p.id === selectedPartId);

    return (
      <div className="min-h-screen bg-[#2D2F31] text-white font-sans flex flex-col overflow-hidden">
        {/* Studio Top Bar (Ribbon Style) */}
        <div className="bg-[#1B1D1F] border-b border-black/50 flex flex-col">
          {/* Menu Tabs */}
          <div className="h-8 flex items-center px-4 space-x-6 text-[11px] font-bold text-gray-400">
            <div className="relative group">
              <button className="hover:text-white pb-1">ARQUIVO</button>
              <div className="absolute top-full left-0 w-48 bg-[#1B1D1F] border border-white/10 shadow-2xl hidden group-hover:block z-50">
                <button onClick={handleSaveLocal} className="w-full text-left px-4 py-2 hover:bg-[#00A2FF] flex items-center"><Download size={12} className="mr-3" /> Salvar no PC (.rbxl)</button>
                <button onClick={handlePublish} className="w-full text-left px-4 py-2 hover:bg-[#00A2FF] flex items-center"><Globe size={12} className="mr-3" /> Publicar no Gublox</button>
                <button 
                  onClick={() => {
                    const url = `${window.location.origin}?mapId=${currentEditingMap}`;
                    navigator.clipboard.writeText(url);
                    alert('Link de compartilhamento copiado!');
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-[#00A2FF] flex items-center"
                >
                  <Link size={12} className="mr-3" /> Copiar Link de Compartilhamento
                </button>
                <div className="h-[1px] bg-white/10 my-1" />
                <button onClick={() => setGameState('create_dashboard')} className="w-full text-left px-4 py-2 hover:bg-red-500 flex items-center"><LogOut size={12} className="mr-3" /> Sair</button>
              </div>
            </div>
            <button className="text-white border-b-2 border-[#00A2FF] pb-1">INÍCIO</button>
            <button className="hover:text-white pb-1">MODELO</button>
            <button className="hover:text-white pb-1">TESTE</button>
            <button className="hover:text-white pb-1">EXIBIR</button>
            <button className="hover:text-white pb-1">PLUGINS</button>
          </div>

          {/* Ribbon Tools */}
          <div className="h-20 bg-[#2D2F31] flex items-center px-4 space-x-1 border-t border-white/5">
            {/* Tools Group */}
            <div className="flex flex-col items-center px-2 border-r border-white/10 h-full justify-center">
              <div className="flex space-x-1">
                <button 
                  onClick={() => setActiveStudioTool('select')}
                  className={`flex flex-col items-center p-1 rounded ${activeStudioTool === 'select' ? 'bg-[#00A2FF]/20 border border-[#00A2FF]' : 'hover:bg-white/5 border border-transparent'}`}
                >
                  <MousePointer2 size={20} />
                  <span className="text-[9px] mt-1">Selecionar</span>
                </button>
                <button 
                  onClick={() => setActiveStudioTool('move')}
                  className={`flex flex-col items-center p-1 rounded ${activeStudioTool === 'move' ? 'bg-[#00A2FF]/20 border border-[#00A2FF]' : 'hover:bg-white/5 border border-transparent'}`}
                >
                  <Move size={20} />
                  <span className="text-[9px] mt-1">Mover</span>
                </button>
                <button 
                  onClick={() => setActiveStudioTool('scale')}
                  className={`flex flex-col items-center p-1 rounded ${activeStudioTool === 'scale' ? 'bg-[#00A2FF]/20 border border-[#00A2FF]' : 'hover:bg-white/5 border border-transparent'}`}
                >
                  <Maximize size={20} />
                  <span className="text-[9px] mt-1">Dimensionar</span>
                </button>
                <button 
                  onClick={() => setActiveStudioTool('rotate')}
                  className={`flex flex-col items-center p-1 rounded ${activeStudioTool === 'rotate' ? 'bg-[#00A2FF]/20 border border-[#00A2FF]' : 'hover:bg-white/5 border border-transparent'}`}
                >
                  <RotateCcw size={20} />
                  <span className="text-[9px] mt-1">Girar</span>
                </button>
                <button 
                  onClick={() => setActiveStudioTool('ban')}
                  className={`flex flex-col items-center p-1 rounded ${activeStudioTool === 'ban' ? 'bg-red-500/20 border border-red-500' : 'hover:bg-white/5 border border-transparent'}`}
                >
                  <X size={20} className="text-red-500" />
                  <span className="text-[9px] mt-1 text-red-500">Banir</span>
                </button>
              </div>
              <span className="text-[8px] text-gray-500 mt-1 uppercase font-bold">Ferramentas</span>
            </div>

            {/* Edit Group */}
            <div className="flex flex-col items-center px-2 border-r border-white/10 h-full justify-center">
              <div className="flex space-x-2">
                <button onClick={handleAddPart} className="flex flex-col items-center p-1 hover:bg-white/5 rounded border border-transparent">
                  <Box size={24} className="text-blue-400" />
                  <span className="text-[9px] mt-1">Parte</span>
                </button>
                <button className="flex flex-col items-center p-1 hover:bg-white/5 rounded border border-transparent opacity-50">
                  <Layers size={24} className="text-green-400" />
                  <span className="text-[9px] mt-1">Terreno</span>
                </button>
              </div>
              <span className="text-[8px] text-gray-500 mt-1 uppercase font-bold">Inserir</span>
            </div>

            {/* Appearance Group */}
            <div className="flex flex-col items-center px-2 border-r border-white/10 h-full justify-center">
              <div className="flex space-x-2">
                <div className="relative group">
                  <button className="flex flex-col items-center p-1 hover:bg-white/5 rounded border border-transparent">
                    <Palette size={24} style={{ color: selectedPart?.color || '#A3A2A5' }} />
                    <span className="text-[9px] mt-1">Cor</span>
                  </button>
                  <div className="absolute top-full left-0 grid grid-cols-4 gap-1 p-2 bg-[#1B1D1F] border border-white/10 hidden group-hover:grid z-50">
                    {['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffffff', '#000000'].map(c => (
                      <div 
                        key={c} 
                        className="w-4 h-4 cursor-pointer border border-white/10" 
                        style={{ backgroundColor: c }}
                        onClick={() => selectedPartId && handleUpdatePart(selectedPartId, { color: c })}
                      />
                    ))}
                  </div>
                </div>
                <button className="flex flex-col items-center p-1 hover:bg-white/5 rounded border border-transparent opacity-50">
                  <Circle size={24} />
                  <span className="text-[9px] mt-1">Material</span>
                </button>
              </div>
              <span className="text-[8px] text-gray-500 mt-1 uppercase font-bold">Aparência</span>
            </div>

            {/* State Group */}
            <div className="flex flex-col items-center px-2 border-r border-white/10 h-full justify-center">
              <div className="flex space-x-2">
                <button 
                  onClick={() => selectedPartId && handleUpdatePart(selectedPartId, { anchored: !selectedPart?.anchored })}
                  className={`flex flex-col items-center p-1 rounded border ${selectedPart?.anchored ? 'bg-[#00A2FF]/20 border-[#00A2FF]' : 'hover:bg-white/5 border-transparent'}`}
                >
                  <Anchor size={24} />
                  <span className="text-[9px] mt-1">Âncora</span>
                </button>
                <button className="flex flex-col items-center p-1 hover:bg-white/5 rounded border border-transparent opacity-50">
                  <Lock size={24} />
                  <span className="text-[9px] mt-1">Bloquear</span>
                </button>
              </div>
              <span className="text-[8px] text-gray-500 mt-1 uppercase font-bold">Estado</span>
            </div>

            {/* Test Group */}
            <div className="flex flex-col items-center px-2 h-full justify-center">
              <div className="flex space-x-2">
                <button 
                  onClick={() => {
                    if (currentEditingMap) {
                      setUserMaps(prev => prev.map(m => m.id === currentEditingMap ? { ...m, parts: studioParts } : m));
                    }
                    setCurrentPlayingMap(currentEditingMap);
                    setGameState('playing');
                  }}
                  className="flex flex-col items-center p-1 hover:bg-white/5 rounded border border-transparent text-green-500"
                >
                  <Play size={24} fill="currentColor" />
                  <span className="text-[9px] mt-1">Jogar</span>
                </button>
              </div>
              <span className="text-[8px] text-gray-500 mt-1 uppercase font-bold">Teste</span>
            </div>
          </div>
        </div>

        {/* Studio Layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Viewport (Center) */}
          <div className="flex-1 bg-[#393B3D] relative">
            <div className="absolute inset-0">
              <Studio3DViewport 
                parts={studioParts}
                selectedId={selectedPartId}
                onSelect={setSelectedPartId}
                activeTool={activeStudioTool}
                onUpdatePart={handleUpdatePart}
                onDeletePart={handleDeletePart}
              />
            </div>

            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
               <div className="text-white/5 opacity-10 text-9xl font-black select-none">GUBLOX STUDIO</div>
            </div>
            
            {/* Explorer (Right Overlay) */}
            <div className="absolute top-4 right-4 w-64 bg-[#1B1D1F]/90 backdrop-blur-sm border border-white/10 rounded shadow-2xl flex flex-col max-h-[80%] z-10">
               <div className="p-2 bg-black/20 text-[10px] font-bold text-gray-400 uppercase border-b border-white/5 flex justify-between items-center">
                 <span>Explorador</span>
                 <Search size={10} />
               </div>
               <div className="flex-1 overflow-y-auto p-2 space-y-1">
                 <div className="text-xs flex items-center text-blue-400 font-bold"><Layers size={12} className="mr-2" /> Workspace</div>
                 <div className="ml-4 space-y-1">
                   {studioParts.map(part => (
                     <div 
                       key={part.id} 
                       onClick={() => setSelectedPartId(part.id)}
                       className={`text-xs flex items-center p-1 rounded cursor-pointer ${selectedPartId === part.id ? 'bg-[#00A2FF] text-white' : 'text-gray-300 hover:bg-white/5'}`}
                     >
                       <Box size={12} className="mr-2" /> {part.name}
                     </div>
                   ))}
                   <div className="text-xs flex items-center text-gray-500 p-1"><Anchor size={12} className="mr-2" /> Terrain</div>
                 </div>
                 <div className="text-xs flex items-center text-blue-400 font-bold mt-2"><User size={12} className="mr-2" /> Players</div>
                 <div className="text-xs flex items-center text-blue-400 font-bold mt-1"><Settings size={12} className="mr-2" /> Lighting</div>
               </div>

               {/* Properties (Bottom of Explorer) */}
               <div className="h-64 border-t border-white/10 flex flex-col">
                 <div className="p-2 bg-black/20 text-[10px] font-bold text-gray-400 uppercase border-b border-white/5">Propriedades - {selectedPart?.name || 'Nenhum'}</div>
                 {selectedPart ? (
                   <div className="flex-1 overflow-y-auto p-3 space-y-3">
                     <div>
                       <label className="text-[9px] text-gray-500 uppercase font-bold block mb-1">Aparência</label>
                       <div className="flex items-center justify-between text-[10px] py-1 border-b border-white/5">
                         <span>Cor</span>
                         <div className="w-3 h-3 border border-white/20" style={{ backgroundColor: selectedPart.color }} />
                       </div>
                       <div className="flex items-center justify-between text-[10px] py-1 border-b border-white/5">
                         <span>Material</span>
                         <span className="text-gray-400">{selectedPart.material}</span>
                       </div>
                     </div>
                     <div>
                       <label className="text-[9px] text-gray-500 uppercase font-bold block mb-1">Dados</label>
                       <div className="flex items-center justify-between text-[10px] py-1 border-b border-white/5">
                         <span>Nome</span>
                         <input 
                           type="text" 
                           value={selectedPart.name} 
                           onChange={(e) => handleUpdatePart(selectedPart.id, { name: e.target.value })}
                           className="bg-transparent border-none text-right outline-none text-gray-400 w-24"
                         />
                       </div>
                       <div className="flex items-center justify-between text-[10px] py-1 border-b border-white/5">
                         <span>Âncora</span>
                         <input 
                           type="checkbox" 
                           checked={selectedPart.anchored} 
                           onChange={(e) => handleUpdatePart(selectedPart.id, { anchored: e.target.checked })}
                         />
                       </div>
                     </div>
                   </div>
                 ) : (
                   <div className="flex-1 flex items-center justify-center text-[10px] text-gray-600 italic">Selecione um objeto</div>
                 )}
               </div>
            </div>
          </div>
        </div>

        {/* Status Bar */}
        <div className="h-6 bg-[#0074BD] flex items-center px-4 text-[10px] font-bold">
          <span className="flex items-center"><Wrench size={10} className="mr-2" /> PRONTO</span>
          <span className="ml-auto">X: {selectedPart?.position[0].toFixed(2) || '0.00'} Y: {selectedPart?.position[1].toFixed(2) || '0.00'} Z: {selectedPart?.position[2].toFixed(2) || '0.00'}</span>
        </div>
      </div>
    );
  }

  if (gameState === 'home') {
    return (
      <div className="min-h-screen relative flex items-center justify-center font-sans overflow-hidden">
        {/* Background Image (Classic Rollercoaster) */}
        <div 
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{ 
            backgroundImage: 'url("https://picsum.photos/seed/roblox-theme-park/1920/1080")', 
            filter: 'brightness(0.8)'
          }}
        >
          {/* Overlay to match the specific look */}
          <div className="absolute inset-0 bg-black/10" />
        </div>

        {/* Share Button (Top Right) */}
        <div className="absolute top-6 right-6 z-20">
          <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg cursor-pointer hover:bg-gray-100 transition-colors">
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
          </div>
        </div>

        <div className="relative z-10 w-full max-w-5xl px-8 flex flex-col md:flex-row items-center justify-between">
          {/* Left Side: Logo and Slogan */}
          <div className="flex flex-col items-center md:items-start mb-12 md:mb-0">
            <GubloxLogo className="h-32 md:h-48 drop-shadow-2xl" />
          </div>

          {/* Right Side: Auth Form */}
          <div className="bg-white/80 backdrop-blur-md p-8 rounded-sm shadow-2xl w-full max-w-md border border-white/30">
            <h2 className="text-gray-500 text-sm font-bold mb-4 tracking-tight uppercase">
              {authMode === 'signup' ? 'Sign up and start having fun!' : 'Login to your account'}
            </h2>
            
            {error && (
              <div className="mb-4 p-2 bg-red-100 border border-red-400 text-red-700 text-xs rounded">
                {error}
              </div>
            )}

            <div className="space-y-4">
              {authMode === 'signup' && (
                <>
                  {/* Birthday */}
                  <div className="flex space-x-2">
                    <div className="flex-1 bg-gray-100/50 border border-gray-300 p-2 text-xs text-gray-400 rounded flex justify-between items-center">
                      Birthday <span className="text-[10px]">▼</span>
                    </div>
                    <select 
                      className="w-20 bg-gray-100/50 border border-gray-300 p-2 text-xs text-gray-400 rounded focus:outline-none"
                      onChange={(e) => setBirthday({ ...birthday, month: e.target.value })}
                    >
                      <option value="">Month</option>
                      <option value="01">Jan</option>
                      <option value="12">Dec</option>
                    </select>
                    <select 
                      className="w-16 bg-gray-100/50 border border-gray-300 p-2 text-xs text-gray-400 rounded focus:outline-none"
                      onChange={(e) => setBirthday({ ...birthday, day: e.target.value })}
                    >
                      <option value="">Day</option>
                      {[...Array(31)].map((_, i) => (
                        <option key={i+1} value={i+1}>{i+1}</option>
                      ))}
                    </select>
                    <select 
                      className="w-20 bg-gray-100/50 border border-gray-300 p-2 text-xs text-gray-400 rounded focus:outline-none"
                      onChange={(e) => setBirthday({ ...birthday, year: e.target.value })}
                    >
                      <option value="">Year</option>
                      {[...Array(20)].map((_, i) => (
                        <option key={2014-i} value={2014-i}>{2014-i}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* Username */}
              <input 
                type="text" 
                placeholder={authMode === 'signup' ? "Don't use your real name" : "Username"} 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-gray-100/50 border border-gray-300 p-3 text-sm rounded placeholder-gray-400 focus:outline-none focus:border-[#00A2FF]"
              />

              {/* Password */}
              <input 
                type="password" 
                placeholder={authMode === 'signup' ? "At least 8 characters" : "Password"} 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-100/50 border border-gray-300 p-3 text-sm rounded placeholder-gray-400 focus:outline-none focus:border-[#00A2FF]"
              />

              {authMode === 'signup' && (
                <div className="flex items-center bg-white border border-gray-300 rounded overflow-hidden">
                  <div className="px-3 py-2 text-xs text-gray-400 border-r border-gray-300">Gender:</div>
                  <button 
                    onClick={() => setGender('male')}
                    className={`flex-1 py-2 flex justify-center hover:bg-gray-50 transition-colors border-r border-gray-300 ${gender === 'male' ? 'bg-blue-50' : ''}`}
                  >
                    <User size={18} className={gender === 'male' ? 'text-blue-500' : 'text-gray-300'} />
                  </button>
                  <button 
                    onClick={() => setGender('female')}
                    className={`flex-1 py-2 flex justify-center hover:bg-gray-50 transition-colors ${gender === 'female' ? 'bg-pink-50' : ''}`}
                  >
                    <User size={18} className={gender === 'female' ? 'text-pink-500' : 'text-gray-300'} />
                  </button>
                </div>
              )}

              {/* Action Button */}
              <button 
                onClick={authMode === 'signup' ? handleSignUp : handleLogin}
                disabled={isLoading}
                className={`w-full text-white font-bold py-3 px-6 rounded-sm text-lg transition-colors shadow-sm active:translate-y-[1px] disabled:opacity-50 ${authMode === 'signup' ? 'bg-[#64C291] hover:bg-[#54B281]' : 'bg-[#00A2FF] hover:bg-[#008CE6]'}`}
              >
                {isLoading ? 'Aguarde...' : (authMode === 'signup' ? 'Sign Up' : 'Login')}
              </button>

              {/* Toggle Mode */}
              <div className="text-center mt-2">
                <button 
                  onClick={() => {
                    setAuthMode(authMode === 'signup' ? 'login' : 'signup');
                    setError(null);
                  }}
                  className="text-sm text-[#00A2FF] hover:underline font-medium"
                >
                  {authMode === 'signup' ? 'Already have an account? Login' : "Don't have an account? Sign Up"}
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Footer Text */}
        <div className="absolute bottom-4 left-0 w-full text-center text-white/50 text-[10px] px-4">
          ROBLOX, "Online Building Toy", characters, logos, names, and all related indicia are trademarks of ROBLOX Corporation, © 2014.
        </div>
      </div>
    );
  }

  if (gameState === 'dashboard') {
    return (
      <div className="min-h-screen bg-[#F2F2F2] flex flex-col font-sans">
        {/* Top Navigation Bar (Blue) */}
        <div className="h-12 bg-[#0074BD] flex items-center px-4 text-white z-50 shadow-md">
          <div className="flex items-center space-x-6">
            <GubloxLogo className="h-8" variant="simple" color="white" />
            <div className="flex space-x-4 text-sm font-bold">
              <button className="hover:text-gray-200">Destaques</button>
              <button className="hover:text-gray-200">Mercado</button>
              <button 
                onClick={() => setGameState('create_login')}
                className="hover:text-gray-200"
              >
                Criar
              </button>
              <button className="hover:text-gray-200">Robux</button>
            </div>
          </div>
          
          <div className="ml-auto flex items-center space-x-4">
            <div className="relative">
              <input 
                type="text" 
                placeholder="Pesquisar" 
                className="bg-white/20 border-none rounded px-3 py-1 text-xs placeholder-white/70 w-48 focus:bg-white focus:text-black focus:placeholder-gray-400 transition-all"
              />
            </div>
            <div className="flex items-center space-x-2 text-xs font-bold">
              <button 
                onClick={() => setIsGubuxModalOpen(true)}
                className="text-white hover:text-gray-200 mr-2"
              >
                Gubux: {gubux}
              </button>
              <span>{currentUser?.username || 'Gustavo_japa31'}</span>
              <div className="w-6 h-6 bg-gray-300 rounded-full overflow-hidden border border-white/20">
                <img src={`https://picsum.photos/seed/user-${currentUser?.id || '24'}/24/24`} alt="U" referrerPolicy="no-referrer" />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar (Dark) */}
          <div className="w-48 bg-[#393B3D] text-gray-300 flex flex-col py-4">
            <div className="px-4 py-2 hover:bg-white/10 cursor-pointer flex items-center text-white bg-white/5 border-l-4 border-[#00A2FF]">
              <Menu size={18} className="mr-3" /> Início
            </div>
            <div className="px-4 py-2 hover:bg-white/10 cursor-pointer flex items-center">
              <User size={18} className="mr-3" /> Perfil
            </div>
            <div className="px-4 py-2 hover:bg-white/10 cursor-pointer flex items-center">
              <MessageSquare size={18} className="mr-3" /> Mensagens
            </div>
            <div className="px-4 py-2 hover:bg-white/10 cursor-pointer flex items-center">
              <User size={18} className="mr-3" /> Amigos
            </div>
            <div 
              className="px-4 py-2 hover:bg-white/10 cursor-pointer flex items-center"
              onClick={() => setGameState('avatar')}
            >
              <User size={18} className="mr-3" /> Avatar
            </div>
            <div className="px-4 py-2 hover:bg-white/10 cursor-pointer flex items-center">
              <Briefcase size={18} className="mr-3" /> Inventário
            </div>
            <div className="mt-auto px-4 py-4 text-[10px] text-gray-500">
              © 2014 Roblox Corporation
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <h1 className="text-2xl font-bold text-gray-800 mb-6">Início</h1>
            
            {/* Conexões Section */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-700">Conexões (646)</h2>
                <button className="text-[#00A2FF] text-xs font-bold hover:underline">Ver todos</button>
              </div>
              <div className="flex space-x-4 overflow-x-auto pb-2">
                <div className="flex-shrink-0 w-24 h-24 bg-white border border-gray-300 rounded flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50">
                  <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center text-gray-400 mb-1">
                    <span className="text-2xl">+</span>
                  </div>
                  <span className="text-[10px] font-bold text-gray-500">Conectar</span>
                </div>
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex-shrink-0 w-24 h-24 bg-white border border-gray-300 rounded flex flex-col items-center p-2 cursor-pointer hover:shadow-md transition-shadow">
                    <div className="w-12 h-12 bg-gray-100 rounded-full overflow-hidden mb-1 border border-gray-200">
                      <img src={`https://picsum.photos/seed/friend${i}/48/48`} alt="F" referrerPolicy="no-referrer" />
                    </div>
                    <span className="text-[10px] font-bold text-gray-700 truncate w-full text-center">Amigo_{i}</span>
                    <div className="w-2 h-2 bg-green-500 rounded-full mt-1" />
                  </div>
                ))}
              </div>
            </div>

            {/* Recomendações Section */}
            <div className="mb-8">
              <h2 className="text-lg font-bold text-gray-700 mb-4">Recomendações para você</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {/* User Published Maps */}
                {userMaps.filter(m => m.published).map(map => (
                  <div 
                    key={map.id}
                    onClick={() => {
                      setCurrentPlayingMap(map.id);
                      setGameState('playing');
                    }}
                    className="bg-white border border-gray-300 rounded overflow-hidden cursor-pointer hover:shadow-lg transition-all group"
                  >
                    <div className="aspect-video bg-gray-200 relative">
                      <img src={`https://picsum.photos/seed/map-${map.id}/300/200`} alt="Game" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <span className="text-white font-bold text-sm">JOGAR</span>
                      </div>
                    </div>
                    <div className="p-2">
                      <div className="text-xs font-bold text-gray-800 truncate">{map.name}</div>
                      <div className="flex items-center mt-1">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-green-500 rounded-full" />
                          <span className="text-[9px] text-gray-500">100%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                <div 
                  onClick={() => {
                    setCurrentPlayingMap(null);
                    setGameState('playing');
                  }}
                  className="bg-white border border-gray-300 rounded overflow-hidden cursor-pointer hover:shadow-lg transition-all group"
                >
                  <div className="aspect-video bg-gray-200 relative">
                    <img src="https://picsum.photos/seed/game1/300/200" alt="Game" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <span className="text-white font-bold text-sm">JOGAR</span>
                    </div>
                  </div>
                  <div className="p-2">
                    <div className="text-xs font-bold text-gray-800 truncate">Project Neko Infection</div>
                    <div className="flex items-center mt-1">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-green-500 rounded-full" />
                        <span className="text-[9px] text-gray-500">60%</span>
                      </div>
                    </div>
                  </div>
                </div>
                {[2, 3, 4, 5].map((i) => (
                  <div key={i} className="bg-white border border-gray-300 rounded overflow-hidden opacity-80 hover:opacity-100 cursor-pointer transition-opacity">
                    <div className="aspect-video bg-gray-200">
                      <img src={`https://picsum.photos/seed/game${i}/300/200`} alt="Game" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </div>
                    <div className="p-2">
                      <div className="text-xs font-bold text-gray-800 truncate">Jogo Aleatório {i}</div>
                      <div className="text-[9px] text-gray-500 mt-1">Avaliação: 85%</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Continuar Section */}
            <div>
              <h2 className="text-lg font-bold text-gray-700 mb-4">Continuar →</h2>
              <div className="flex space-x-4 overflow-x-auto pb-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex-shrink-0 w-48 bg-white border border-gray-300 rounded overflow-hidden cursor-pointer hover:shadow-md transition-shadow">
                    <div className="aspect-video bg-gray-100">
                      <img src={`https://picsum.photos/seed/cont${i}/200/120`} alt="C" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </div>
                    <div className="p-2">
                      <div className="text-xs font-bold text-gray-800">Último Jogo {i}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Chat Bar (Blue) */}
        <div className="h-8 bg-[#0074BD] mt-auto flex items-center px-4 justify-end">
          <button className="bg-white/20 hover:bg-white/30 text-white text-[10px] font-bold px-4 h-full flex items-center">
            Bate-papo
          </button>
        </div>

        {/* Gubux Modal */}
        <AnimatePresence>
          {isGubuxModalOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="absolute inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
            >
              <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-gray-900">Comprar Gubux</h3>
                  <button onClick={() => setIsGubuxModalOpen(false)} className="text-gray-500 hover:text-gray-800">Fechar</button>
                </div>
                <div className="space-y-3">
                  {[
                    { gubux: 80, price: 1.00 },
                    { gubux: 100, price: 20.00 },
                    { gubux: 800, price: 25.00 },
                    { gubux: 1000, price: 100.00 },
                  ].map((item) => (
                    <div 
                      key={item.gubux}
                      className="w-full flex justify-between items-center bg-gray-100 p-4 rounded-xl"
                    >
                      <span className="font-bold text-lg">{item.gubux} Gubux</span>
                      <span className="text-gray-600">R$ {item.price.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-6 pt-4 border-t border-gray-200">
                  <p className="text-sm text-gray-500 mb-4 text-center">Métodos de Pagamento</p>
                  <div className="grid grid-cols-3 gap-2">
                    <button 
                      onClick={() => handlePayment(100, 'google_pay')}
                      className="bg-gray-800 text-white py-2 rounded-lg text-xs font-bold hover:bg-gray-700"
                    >
                      Google Pay
                    </button>
                    <button 
                      onClick={() => handlePayment(100, 'pix')}
                      className="bg-emerald-600 text-white py-2 rounded-lg text-xs font-bold hover:bg-emerald-500"
                    >
                      PIX
                    </button>
                    <button 
                      onClick={() => handlePayment(100, 'credit_card')}
                      className="bg-blue-600 text-white py-2 rounded-lg text-xs font-bold hover:bg-blue-500"
                    >
                      Cartão
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  if (gameState === 'avatar') {
    return (
      <div className="min-h-screen bg-[#F2F2F2] flex flex-col font-sans">
        {/* Top Navigation Bar (Blue) */}
        <div className="h-12 bg-[#0074BD] flex items-center px-4 text-white z-50 shadow-md">
          <div className="flex items-center space-x-6">
            <img 
              src="https://upload.wikimedia.org/wikipedia/commons/3/3a/Roblox_logo.svg" 
              alt="Roblox" 
              className="h-6 brightness-0 invert cursor-pointer"
              referrerPolicy="no-referrer"
              onClick={() => setGameState('dashboard')}
            />
            <div className="flex space-x-4 text-sm font-bold">
              <button className="hover:text-gray-200" onClick={() => setGameState('dashboard')}>Início</button>
            </div>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Main Content */}
          <div className="flex-1 flex flex-col md:flex-row p-6 gap-6 overflow-y-auto">
            
            {/* 3D Preview */}
            <div className="w-full md:w-1/3 bg-white border border-gray-300 rounded shadow-sm flex flex-col">
              <div className="p-4 border-b border-gray-200 bg-gray-50">
                <h2 className="text-lg font-bold text-gray-800">Avatar Preview</h2>
              </div>
              <div className="flex-1 relative min-h-[400px]">
                <Canvas camera={{ position: [0, 2, 5], fov: 50 }} dpr={[1, 1.5]} performance={{ min: 0.5 }}>
                  <ambientLight intensity={0.7} />
                  <pointLight position={[10, 10, 10]} intensity={1.5} />
                  <PlayerModel 
                    player={{ id: 'preview', x: 400, y: 300, jumpHeight: 0, color: '#fff', name: '', avatarConfig }} 
                    isMe={false} 
                    currentUser={null}
                    onBan={() => {}}
                  />
                  <OrbitControls enablePan={false} minPolarAngle={0} maxPolarAngle={Math.PI / 2} />
                </Canvas>
              </div>
            </div>

            {/* Customization Options */}
            <div className="w-full md:w-2/3 bg-white border border-gray-300 rounded shadow-sm flex flex-col">
              <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                <h2 className="text-lg font-bold text-gray-800">Editor de Avatar</h2>
                <button 
                  onClick={() => {
                    if (socketRef.current) {
                      socketRef.current.emit('updateAvatar', avatarConfig);
                    }
                    setGameState('dashboard');
                  }}
                  className="bg-[#00A2FF] hover:bg-[#0082CC] text-white px-4 py-2 rounded font-bold text-sm transition-colors"
                >
                  Salvar e Voltar
                </button>
              </div>
              
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8 overflow-y-auto">
                {/* Colors */}
                <div>
                  <h3 className="font-bold text-gray-700 mb-4 border-b pb-2">Cores do Corpo</h3>
                  <div className="space-y-4">
                    {(['headColor', 'torsoColor', 'armColor', 'legColor'] as const).map((part) => (
                      <div key={part} className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 capitalize">{part.replace('Color', '')}</span>
                        <div className="flex space-x-2">
                          {['#f5cd30', '#005eb8', '#4b974b', '#ff0000', '#111111', '#ffffff'].map((color) => (
                            <button
                              key={color}
                              className={`w-6 h-6 rounded-sm border-2 ${avatarConfig[part] === color ? 'border-blue-500' : 'border-gray-300'}`}
                              style={{ backgroundColor: color }}
                              onClick={() => setAvatarConfig(prev => ({ ...prev, [part]: color }))}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Hats */}
                <div>
                  <h3 className="font-bold text-gray-700 mb-4 border-b pb-2">Chapéus</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div 
                      className={`border-2 rounded p-2 cursor-pointer flex flex-col items-center justify-center h-24 ${avatarConfig.hat === null ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                      onClick={() => setAvatarConfig(prev => ({ ...prev, hat: null }))}
                    >
                      <span className="text-sm font-bold text-gray-500">Nenhum</span>
                    </div>
                    <div 
                      className={`border-2 rounded p-2 cursor-pointer flex flex-col items-center justify-center h-24 ${avatarConfig.hat === 'cap' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                      onClick={() => setAvatarConfig(prev => ({ ...prev, hat: 'cap' }))}
                    >
                      <div className="w-8 h-4 bg-red-500 rounded-t-full mb-1" />
                      <span className="text-xs font-bold text-gray-700 text-center">Boné Vermelho</span>
                    </div>
                    <div 
                      className={`border-2 rounded p-2 cursor-pointer flex flex-col items-center justify-center h-24 ${avatarConfig.hat === 'tophat' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                      onClick={() => setAvatarConfig(prev => ({ ...prev, hat: 'tophat' }))}
                    >
                      <div className="w-6 h-6 bg-gray-900 mb-1 flex flex-col items-center justify-end">
                        <div className="w-8 h-1 bg-gray-900" />
                      </div>
                      <span className="text-xs font-bold text-gray-700 text-center">Cartola</span>
                    </div>
                    <div 
                      className={`border-2 rounded p-2 cursor-pointer flex flex-col items-center justify-center h-24 ${avatarConfig.hat === 'crown' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                      onClick={() => setAvatarConfig(prev => ({ ...prev, hat: 'crown' }))}
                    >
                      <div className="w-8 h-4 bg-yellow-400 mb-1 flex items-end justify-between px-1">
                        <div className="w-1 h-2 bg-yellow-400" />
                        <div className="w-1 h-3 bg-yellow-400" />
                        <div className="w-1 h-2 bg-yellow-400" />
                      </div>
                      <span className="text-xs font-bold text-gray-700 text-center">Coroa</span>
                    </div>
                    <div 
                      className={`border-2 rounded p-2 cursor-pointer flex flex-col items-center justify-center h-24 ${avatarConfig.hat === 'headphones' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                      onClick={() => setAvatarConfig(prev => ({ ...prev, hat: 'headphones' }))}
                    >
                      <div className="w-8 h-6 border-t-4 border-l-4 border-r-4 border-gray-800 rounded-t-full mb-1 flex items-end justify-between">
                        <div className="w-2 h-3 bg-red-500 -ml-1" />
                        <div className="w-2 h-3 bg-red-500 -mr-1" />
                      </div>
                      <span className="text-xs font-bold text-gray-700 text-center">Fones</span>
                    </div>
                  </div>
                </div>

                {/* Accessories */}
                <div>
                  <h3 className="font-bold text-gray-700 mb-4 border-b pb-2">Acessórios</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div 
                      className={`border-2 rounded p-2 cursor-pointer flex flex-col items-center justify-center h-24 ${avatarConfig.accessory === null ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                      onClick={() => setAvatarConfig(prev => ({ ...prev, accessory: null }))}
                    >
                      <span className="text-sm font-bold text-gray-500">Nenhum</span>
                    </div>
                    <div 
                      className={`border-2 rounded p-2 cursor-pointer flex flex-col items-center justify-center h-24 ${avatarConfig.accessory === 'glasses' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                      onClick={() => setAvatarConfig(prev => ({ ...prev, accessory: 'glasses' }))}
                    >
                      <div className="w-8 h-3 border-2 border-gray-800 rounded-sm mb-1 flex items-center justify-center">
                        <div className="w-1 h-full bg-gray-800" />
                      </div>
                      <span className="text-xs font-bold text-gray-700 text-center">Óculos</span>
                    </div>
                    <div 
                      className={`border-2 rounded p-2 cursor-pointer flex flex-col items-center justify-center h-24 ${avatarConfig.accessory === 'backpack' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                      onClick={() => setAvatarConfig(prev => ({ ...prev, accessory: 'backpack' }))}
                    >
                      <div className="w-6 h-8 bg-red-500 rounded-t-md mb-1" />
                      <span className="text-xs font-bold text-gray-700 text-center">Mochila</span>
                    </div>
                    {currentUser?.username === 'Gustavo_japa30' && (
                      <div 
                        className={`border-2 rounded p-2 cursor-pointer flex flex-col items-center justify-center h-24 ${avatarConfig.accessory === 'banhammer' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                        onClick={() => setAvatarConfig(prev => ({ ...prev, accessory: 'banhammer' }))}
                      >
                        <div className="w-6 h-8 bg-gray-800 rounded-t-md mb-1" />
                        <span className="text-xs font-bold text-gray-700 text-center">Martelo</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Shirts */}
                <div>
                  <h3 className="font-bold text-gray-700 mb-4 border-b pb-2">Camisas</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div 
                      className={`border-2 rounded p-2 cursor-pointer flex flex-col items-center justify-center h-24 ${avatarConfig.shirt === null ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                      onClick={() => setAvatarConfig(prev => ({ ...prev, shirt: null }))}
                    >
                      <span className="text-sm font-bold text-gray-500">Nenhuma</span>
                    </div>
                    <div 
                      className={`border-2 rounded p-2 cursor-pointer flex flex-col items-center justify-center h-24 ${avatarConfig.shirt === 'tshirt' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                      onClick={() => setAvatarConfig(prev => ({ ...prev, shirt: 'tshirt' }))}
                    >
                      <div className="w-8 h-8 bg-gray-200 mb-1 flex items-center justify-center">
                        <div className="w-4 h-4 bg-blue-500 rounded-full" />
                      </div>
                      <span className="text-xs font-bold text-gray-700 text-center">T-Shirt</span>
                    </div>
                    <div 
                      className={`border-2 rounded p-2 cursor-pointer flex flex-col items-center justify-center h-24 ${avatarConfig.shirt === 'suit' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                      onClick={() => setAvatarConfig(prev => ({ ...prev, shirt: 'suit' }))}
                    >
                      <div className="w-8 h-8 bg-gray-800 mb-1 flex justify-center">
                        <div className="w-2 h-full bg-white flex justify-center">
                          <div className="w-1 h-4 bg-red-600 mt-1" />
                        </div>
                      </div>
                      <span className="text-xs font-bold text-gray-700 text-center">Terno</span>
                    </div>
                  </div>
                </div>

                {/* Pants */}
                <div className="md:col-span-2">
                  <h3 className="font-bold text-gray-700 mb-4 border-b pb-2">Calças</h3>
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
                    <div 
                      className={`border-2 rounded p-2 cursor-pointer flex flex-col items-center justify-center h-24 ${avatarConfig.pants === null ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                      onClick={() => setAvatarConfig(prev => ({ ...prev, pants: null }))}
                    >
                      <span className="text-sm font-bold text-gray-500">Nenhuma</span>
                    </div>
                    <div 
                      className={`border-2 rounded p-2 cursor-pointer flex flex-col items-center justify-center h-24 ${avatarConfig.pants === 'jeans' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                      onClick={() => setAvatarConfig(prev => ({ ...prev, pants: 'jeans' }))}
                    >
                      <div className="w-8 h-8 bg-blue-600 mb-1 flex justify-between">
                        <div className="w-3 h-full border-r border-blue-800" />
                        <div className="w-3 h-full border-l border-blue-800" />
                      </div>
                      <span className="text-xs font-bold text-gray-700 text-center">Jeans</span>
                    </div>
                    <div 
                      className={`border-2 rounded p-2 cursor-pointer flex flex-col items-center justify-center h-24 ${avatarConfig.pants === 'shorts' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                      onClick={() => setAvatarConfig(prev => ({ ...prev, pants: 'shorts' }))}
                    >
                      <div className="w-8 h-8 flex flex-col">
                        <div className="w-full h-4 bg-purple-600 flex justify-between">
                          <div className="w-3 h-full border-r border-purple-800" />
                          <div className="w-3 h-full border-l border-purple-800" />
                        </div>
                        <div className="w-full h-4 bg-yellow-400 flex justify-between">
                          <div className="w-3 h-full border-r border-yellow-500" />
                          <div className="w-3 h-full border-l border-yellow-500" />
                        </div>
                      </div>
                      <span className="text-xs font-bold text-gray-700 text-center">Shorts</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen bg-[#BFBFBF] overflow-hidden font-sans select-none">
      {/* Top Bar (Image 3 style) */}
      <div className="absolute top-0 left-0 w-full h-10 bg-[#00A2FF]/90 backdrop-blur-sm flex items-center px-4 z-40 border-b border-white/20">
        <div className="flex items-center space-x-4">
          <button onClick={() => setIsMenuOpen(true)} className="text-white hover:bg-white/20 p-1 rounded transition-colors">
            <Menu size={24} />
          </button>
          <button 
            onClick={() => {
              setIsChatVisible(!isChatVisible);
              if (isChatVisible) setIsChatFocused(false);
            }}
            className={`text-white p-1 rounded transition-colors ${isChatVisible ? 'bg-white/20' : 'hover:bg-white/20'}`}
          >
            <MessageSquare size={20} />
          </button>
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className={`text-white p-1 rounded transition-colors ${!isMuted ? 'bg-green-500/50' : 'bg-red-500/50 hover:bg-red-500/70'}`}
          >
            {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
          <button className="text-white hover:bg-white/20 p-1 rounded transition-colors">
            <Briefcase size={20} />
          </button>
        </div>
        <div className="ml-auto flex items-center space-x-4">
          <button 
            onClick={() => setGameState('create_login')}
            className="bg-[#00A2FF] hover:bg-[#008CE6] px-3 py-1 rounded text-[10px] font-bold flex items-center shadow-lg active:translate-y-[1px] transition-all text-white"
          >
            <Wrench size={12} className="mr-2" /> STUDIO
          </button>
          <button 
            onClick={() => setIsGubuxModalOpen(true)}
            className="text-white font-bold text-sm hover:bg-white/20 px-2 py-1 rounded transition-colors"
          >
            Gubux: {gubux}
          </button>
          <div className="w-8 h-8 bg-gray-300 rounded-full border-2 border-white overflow-hidden">
            <img src="https://picsum.photos/seed/avatar/32/32" alt="Avatar" referrerPolicy="no-referrer" />
          </div>
        </div>
      </div>

      {/* Game World (3D Canvas) */}
      <div className="w-full h-full relative">
        <Suspense fallback={
          <div className="absolute inset-0 flex items-center justify-center bg-[#0074BD] text-white font-bold z-50">
            <div className="flex flex-col items-center">
              <GubloxLogo className="h-24 mb-4 animate-pulse" />
              <p className="text-xl">Carregando Jogo...</p>
            </div>
          </div>
        }>
          <Canvas 
            shadows 
            camera={{ position: [20, 20, 20], fov: 50 }}
            onContextMenu={(e) => e.preventDefault()}
            dpr={[1, 1.5]}
            performance={{ min: 0.5 }}
            onCreated={() => console.log("Canvas created")}
          >
            <GameWorld 
              players={players} 
              myId={myId} 
              parts={currentPlayingMap ? (userMaps.find(m => m.id === currentPlayingMap)?.parts || []) : studioParts} 
              currentUser={currentUser}
              onBan={handleBan}
              isSuperMode={isSuperMode}
            />
          </Canvas>
        </Suspense>
      </div>

      {/* In-Game Menu (Image 2 style) */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 z-50 flex flex-col items-center justify-center"
          >
            <div className="w-full max-w-3xl bg-[#393B3D] rounded-lg shadow-2xl overflow-hidden border border-white/10">
              {/* Menu Tabs */}
              <div className="flex bg-[#4B4D4F] border-b border-white/5">
                <button className="flex-1 flex items-center justify-center py-3 text-white border-b-2 border-[#00A2FF] bg-[#393B3D]">
                  <User size={18} className="mr-2" /> Players
                </button>
                <button className="flex-1 flex items-center justify-center py-3 text-gray-400 hover:text-white transition-colors">
                  <Settings size={18} className="mr-2" /> Settings
                </button>
                <button className="flex-1 flex items-center justify-center py-3 text-gray-400 hover:text-white transition-colors">
                  <Flag size={18} className="mr-2" /> Report
                </button>
                <button className="flex-1 flex items-center justify-center py-3 text-gray-400 hover:text-white transition-colors">
                  <HelpCircle size={18} className="mr-2" /> Help
                </button>
                <button className="flex-1 flex items-center justify-center py-3 text-gray-400 hover:text-white transition-colors">
                  <Video size={18} className="mr-2" /> Record
                </button>
              </div>

              {/* Menu Content */}
              <div className="p-6 min-h-[300px]">
                <div className="bg-[#4B4D4F] rounded p-4 mb-4 flex items-center justify-between">
                  <div className="flex items-center">
                    <MessageSquare size={18} className="text-gray-300 mr-3" />
                    <span className="text-white text-sm">Invite friends to play</span>
                  </div>
                </div>

                <div className="space-y-2">
                  {(Object.values(players) as Player[]).map((player) => (
                    <div key={player.id} className="bg-[#4B4D4F] rounded p-3 flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="w-8 h-8 rounded bg-gray-600 mr-3 overflow-hidden">
                          <img src={`https://picsum.photos/seed/${player.id}/32/32`} alt="P" referrerPolicy="no-referrer" />
                        </div>
                        <span className="text-white text-sm font-medium">
                          {player.name}
                          {player.name === 'Gustavo_japa30' && ' ⭐'}
                        </span>
                      </div>
                      {player.id !== myId && (
                        friends.includes(player.id) ? (
                          <button 
                            disabled
                            className="bg-gray-500 text-white text-xs px-4 py-1.5 rounded font-bold cursor-default"
                          >
                            Friend
                          </button>
                        ) : (
                          <button 
                            onClick={() => handleSendFriendRequest(player.id)}
                            className="bg-[#00A2FF] hover:bg-[#0082CC] text-white text-xs px-4 py-1.5 rounded font-bold transition-colors"
                          >
                            Add Friend
                          </button>
                        )
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Menu Footer Buttons */}
              <div className="flex items-center justify-center space-x-4 p-6 bg-[#2D2F31]">
                <button 
                  onClick={handleResetCharacter}
                  className="bg-[#4B4D4F] hover:bg-[#5B5D5F] text-gray-400 px-6 py-2 rounded flex items-center text-sm font-bold transition-colors"
                >
                  <RotateCcw size={16} className="mr-2" /> Reset Character
                </button>
                <button 
                  onClick={() => setGameState('home')}
                  className="bg-[#4B4D4F] hover:bg-[#5B5D5F] text-white px-8 py-2 rounded flex items-center text-sm font-bold transition-colors"
                >
                  <LogOut size={16} className="mr-2" /> Leave Game
                </button>
                <button 
                  onClick={() => setIsMenuOpen(false)}
                  className="bg-white hover:bg-gray-200 text-black px-8 py-2 rounded flex items-center text-sm font-bold transition-colors"
                >
                  <X size={16} className="mr-2" /> Resume Game
                </button>
              </div>
            </div>
            
            <div className="mt-6 flex space-x-8">
               <div className="flex flex-col items-center cursor-pointer hover:opacity-80 transition-opacity" onClick={handleResetCharacter}>
                 <div className="w-10 h-10 bg-[#4B4D4F] rounded flex items-center justify-center text-white font-bold mb-1">R</div>
                 <span className="text-gray-400 text-[10px] uppercase font-bold">Reset Character</span>
               </div>
               <div className="flex flex-col items-center cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setGameState('create_login')}>
                 <div className="w-10 h-10 bg-[#00A2FF] rounded flex items-center justify-center text-white font-bold mb-1">S</div>
                 <span className="text-gray-400 text-[10px] uppercase font-bold">Studio</span>
               </div>
               <div className="flex flex-col items-center cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setGameState('home')}>
                 <div className="w-10 h-10 bg-[#4B4D4F] rounded flex items-center justify-center text-white font-bold mb-1">L</div>
                 <span className="text-gray-400 text-[10px] uppercase font-bold">Leave Game</span>
               </div>
               <div className="flex flex-col items-center cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setIsMenuOpen(false)}>
                 <div className="w-10 h-10 bg-white rounded flex items-center justify-center text-black font-bold mb-1">ESC</div>
                 <span className="text-gray-400 text-[10px] uppercase font-bold">Resume Game</span>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Preview (Bottom Left) */}
      {isChatVisible && (
        <div className="absolute bottom-48 md:bottom-4 left-4 z-30 flex flex-col pointer-events-none md:pointer-events-auto">
          <div 
            ref={chatContainerRef}
            className={`bg-black/40 backdrop-blur-sm p-2 rounded-t text-white text-xs w-64 md:w-80 h-32 md:h-48 overflow-y-auto flex flex-col transition-opacity duration-300 pointer-events-auto ${isChatFocused ? 'opacity-100' : 'opacity-70'}`}
          >
            <div className="opacity-70 mb-1">Sistema: Bem-vindo ao Gublox 2014!</div>
            <div className="opacity-70 mb-1">Sistema: Use W,A,S,D para mover.</div>
            <div className="opacity-70 mb-2">Sistema: ESC para abrir o menu.</div>
            
            {chatMessages.map((msg) => (
              <div key={msg.id} className="mb-1 break-words">
                <span className="font-bold text-gray-300">[{msg.timestamp}] {msg.sender}: </span>
                <span>{msg.text}</span>
              </div>
            ))}
          </div>
          
          <form onSubmit={handleSendChat} className="flex w-64 md:w-80 pointer-events-auto">
            <input
              id="chat-input"
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onFocus={() => setIsChatFocused(true)}
              onBlur={() => setIsChatFocused(false)}
              placeholder="To chat click here or press '/' key"
              className="w-full bg-black/60 text-white text-xs p-2 rounded-b outline-none border border-white/10 focus:border-white/30"
            />
          </form>
        </div>
      )}

      {/* Gubux Modal */}
      <AnimatePresence>
        {isGubuxModalOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          >
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-900">Comprar Gubux</h3>
                <button onClick={() => setIsGubuxModalOpen(false)} className="text-gray-500 hover:text-gray-800">Fechar</button>
              </div>
              <div className="space-y-3">
                {[
                  { gubux: 80, price: 1.00 },
                  { gubux: 100, price: 20.00 },
                  { gubux: 800, price: 25.00 },
                  { gubux: 1000, price: 100.00 },
                ].map((item) => (
                  <button 
                    key={item.gubux}
                    className="w-full flex justify-between items-center bg-gray-100 p-4 rounded-xl hover:bg-gray-200 transition-colors"
                  >
                    <span className="font-bold text-lg">{item.gubux} Gubux</span>
                    <span className="text-gray-600">R$ {item.price.toFixed(2)}</span>
                  </button>
                ))}
              </div>
              <div className="mt-6 pt-4 border-t border-gray-200">
                <button 
                  onClick={async () => {
                    if (!currentUser) return alert("Faça login para resgatar o cupom");
                    try {
                      const response = await fetch('/api/claim-coupon', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: currentUser.id })
                      });
                      const data = await response.json();
                      if (data.success) {
                        alert(data.message);
                        setGubux(data.gubux);
                      } else {
                        alert(data.error);
                      }
                    } catch (e) {
                      alert("Erro ao resgatar cupom");
                    }
                  }}
                  className="w-full bg-yellow-500 hover:bg-yellow-400 text-white py-3 rounded-xl font-bold mb-4"
                >
                  Resgatar Cupom Vale Gubux
                </button>
                <p className="text-sm text-gray-500 mb-4 text-center">Métodos de Pagamento</p>
                <div className="grid grid-cols-3 gap-2">
                  <button className="bg-gray-800 text-white py-2 rounded-lg text-xs font-bold">Google Pay</button>
                  <button className="bg-emerald-600 text-white py-2 rounded-lg text-xs font-bold">PIX</button>
                  <button className="bg-blue-600 text-white py-2 rounded-lg text-xs font-bold">Cartão</button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Friend Request Notification */}
      <AnimatePresence>
        {friendRequest && (
          <motion.div
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            className="absolute bottom-20 right-4 z-50 bg-[#393B3D] border border-white/10 rounded-lg shadow-xl p-4 w-72"
          >
            <div className="flex items-start mb-3">
              <div className="w-10 h-10 bg-gray-600 rounded mr-3 overflow-hidden shrink-0">
                 <img src={`https://picsum.photos/seed/${friendRequest.fromId}/40/40`} alt="Avatar" referrerPolicy="no-referrer" />
              </div>
              <div>
                <h4 className="text-white font-bold text-sm">{friendRequest.fromName}</h4>
                <p className="text-gray-300 text-xs mt-1">sent you a friend request</p>
              </div>
            </div>
            <div className="flex space-x-2">
              <button 
                onClick={() => handleFriendRequestResponse(true)}
                className="flex-1 bg-[#00A2FF] hover:bg-[#0082CC] text-white text-xs font-bold py-2 rounded transition-colors"
              >
                Yes
              </button>
              <button 
                onClick={() => handleFriendRequestResponse(false)}
                className="flex-1 bg-[#4B4D4F] hover:bg-[#5B5D5F] text-white text-xs font-bold py-2 rounded transition-colors"
              >
                No
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI Assistant Button and Super Mode Button */}
      {gameState === 'playing' && (
        <div className="absolute bottom-32 right-8 z-40 flex flex-col gap-4">
          <button 
            onClick={() => setIsAiAssistantOpen(true)}
            className="w-14 h-14 bg-blue-500 rounded-full flex items-center justify-center text-white shadow-lg hover:bg-blue-600 transition-all border-2 border-white/30"
          >
            <Bot size={24} />
          </button>
          <button 
            onClick={toggleSuperMode}
            className={`w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg transition-all border-2 border-white/30 ${isSuperMode ? 'bg-yellow-500 animate-pulse' : 'bg-gray-600'}`}
          >
            <Zap size={24} />
          </button>
        </div>
      )}

      {/* AI Assistant Chat Window */}
      <AnimatePresence>
        {isAiAssistantOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="fixed bottom-24 right-8 w-80 h-96 bg-[#2B2D2F] rounded-xl shadow-2xl z-50 flex flex-col border border-white/10 overflow-hidden"
          >
            <div className="p-4 bg-[#1B1D1F] flex items-center justify-between border-bottom border-white/10">
              <div className="flex items-center gap-2">
                <Bot size={20} className="text-blue-400" />
                <span className="text-white font-bold">Assistente Gublox</span>
              </div>
              <button onClick={() => setIsAiAssistantOpen(false)} className="text-gray-400 hover:text-white">
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
              {aiMessages.length === 0 && (
                <div className="text-gray-400 text-center mt-10">
                  <Sparkles size={40} className="mx-auto mb-4 opacity-20" />
                  <p className="text-sm">Olá! Sou seu assistente inteligente. Como posso ajudar hoje?</p>
                </div>
              )}
              {aiMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] p-3 rounded-lg text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-[#3B3D3F] text-gray-200'}`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {isAiLoading && (
                <div className="flex justify-start">
                  <div className="bg-[#3B3D3F] p-3 rounded-lg flex gap-1">
                    <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce delay-75" />
                    <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce delay-150" />
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-4 bg-[#1B1D1F] flex gap-2">
              <input 
                type="text" 
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAiMessage()}
                placeholder="Pergunte algo..."
                className="flex-1 bg-[#2B2D2F] text-white text-sm rounded-lg px-3 py-2 outline-none border border-white/5 focus:border-blue-500"
              />
              <button 
                onClick={() => handleAiMessage()}
                disabled={isAiLoading}
                className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Send size={18} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Controls (Dynamic Thumbstick) */}
      <div 
        className="absolute top-10 left-0 w-1/2 h-[calc(100%-2.5rem)] z-40 touch-none md:hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {joystickUI.active && (
          <div 
            className="absolute w-24 h-24 bg-black/10 rounded-full border-2 border-black/30 pointer-events-none"
            style={{ 
              left: joystickUI.origin.x - 48, 
              top: joystickUI.origin.y - 48 
            }}
          >
            <div 
              className="absolute w-12 h-12 bg-black/70 rounded-full shadow-lg"
              style={{ 
                left: 24 + (joystickUI.current.x - joystickUI.origin.x), 
                top: 24 + (joystickUI.current.y - joystickUI.origin.y) 
              }}
            />
          </div>
        )}
      </div>

      <div className="absolute bottom-12 right-8 z-40 md:hidden opacity-70 pointer-events-auto">
        <button 
          className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center text-white active:bg-white/40 touch-none border-2 border-white/30 font-bold text-xs"
          onPointerDown={performJump}
        >
          JUMP
        </button>
      </div>
    </div>
  );
}
