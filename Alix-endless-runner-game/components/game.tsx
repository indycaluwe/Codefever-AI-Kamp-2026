'use client'

import React, { useEffect, useRef, useState } from 'react'

interface Player {
  lane: number // 0, 1, or 2
  targetLane: number
  laneProgress: number
}

interface Obstacle {
  lane: number
  depth: number // 0 = far, 1 = close to collision
  monsterType: number
  width: number
  height: number
}

const LANE_WIDTH = 266
const CANVAS_WIDTH = 800
const CANVAS_HEIGHT = 600
const LANE_Y = 400

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameStateRef = useRef({
    isRunning: false,
    score: 0,
    highScore: typeof window !== 'undefined' ? parseInt(localStorage.getItem('monsterSurferHighScore') || '0') : 0,
    gameSpeed: 0.012,
    distance: 0,
    difficulty: 1,
  })

  const playerRef = useRef<Player>({
    lane: 1,
    targetLane: 1,
    laneProgress: 0,
  })

  const obstaclesRef = useRef<Obstacle[]>([])
  const [score, setScore] = useState(0)
  const [highScore, setHighScore] = useState(gameStateRef.current.highScore)
  const [isGameOver, setIsGameOver] = useState(false)
  const [gameStarted, setGameStarted] = useState(false)
  const monsterImagesRef = useRef<HTMLImageElement[]>([])
  const keysPressed = useRef<{ [key: string]: boolean }>({})
  const deathSoundRef = useRef<HTMLAudioElement | null>(null)
  const bgMusicRef = useRef<HTMLAudioElement | null>(null)

  // Draw horse in current lane
  const drawHorse = (ctx: CanvasRenderingContext2D, player: Player, frameCount: number) => {
    const laneX = player.lane * LANE_WIDTH + LANE_WIDTH / 2
    const x = laneX - 20
    const y = LANE_Y

    // Body
    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(x + 5, y + 15, 30, 20)

    // Head
    ctx.beginPath()
    ctx.arc(x + 35, y + 10, 8, 0, Math.PI * 2)
    ctx.fillStyle = '#1a1a1a'
    ctx.fill()

    // Ears
    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(x + 32, y + 2, 3, 5)
    ctx.fillRect(x + 38, y + 2, 3, 5)

    // Neck
    ctx.fillRect(x + 30, y + 12, 6, 12)

    // Front legs (animated)
    const legOffset = Math.sin((frameCount * 0.1) % Math.PI) * 3
    ctx.fillRect(x + 22, y + 35 - legOffset, 4, 8 + legOffset)
    ctx.fillRect(x + 28, y + 35 + legOffset, 4, 8 - legOffset)

    // Back legs
    ctx.fillRect(x + 8, y + 35, 4, 8)
    ctx.fillRect(x + 14, y + 35, 4, 8)

    // Rider
    ctx.fillStyle = '#4a4a4a'
    ctx.beginPath()
    ctx.arc(x + 20, y + 5, 6, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillRect(x + 16, y + 12, 8, 10)
  }

  // Draw monster with 3D perspective
  const drawMonster = (ctx: CanvasRenderingContext2D, obstacle: Obstacle) => {
    const img = monsterImagesRef.current[obstacle.monsterType]
    if (!img || !img.complete) return

    const laneX = obstacle.lane * LANE_WIDTH
    const depthProgress = obstacle.depth

    // Scale based on depth (far = small, close = big)
    const scale = 0.08 + depthProgress * 0.12
    const width = img.width * scale
    const height = img.height * scale

    // Y position based on depth (perspective)
    const yBase = 100 + depthProgress * 250
    const y = yBase - height / 2

    // Fade in/out based on depth
    ctx.globalAlpha = Math.min(1, depthProgress + 0.3)

    // Center monster in lane
    const x = laneX + LANE_WIDTH / 2 - width / 2

    ctx.drawImage(img, x, y, width, height)
    ctx.globalAlpha = 1
  }

  // Preload monster images
  useEffect(() => {
    const monsterUrls = [
      'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Een%20monster%20met%203%20ogen%2C%206%20armen%20en%204%20benen-Photoroom-lF9KHltAqxEanksXyrzFkje4cP9Npt.png',
      'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Een%20monster%20met%206%20armen-Photoroom-4v4TsiS0Zm1GYfmVYwVdIQJIdSzSCK.png',
      'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Een%20monster%20met%203%20ogen%2C%202%20armen%20en%206%20benen-Photoroom-85MjiCG7MYJlFCTn0B4n3k8ZPvwW09.png',
      'https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Een%20monster%20met%202%20ogen%2C%202%20armen%20en%204%20benen-Photoroom-FUj7qViXcuvPeXpBNruKyqKVfKbS1G.png',
    ]

    const loadImages = async () => {
      const images: HTMLImageElement[] = []
      for (const url of monsterUrls) {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.src = url
        await new Promise((resolve) => {
          img.onload = resolve
          img.onerror = resolve
        })
        images.push(img)
      }
      monsterImagesRef.current = images
    }

    loadImages()
  }, [])

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let frameCount = 0
    let animationId: number

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') {
        keysPressed.current['left'] = true
      }
      if (e.key === 'ArrowRight' || e.key === 'd') {
        keysPressed.current['right'] = true
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') {
        keysPressed.current['left'] = false
      }
      if (e.key === 'ArrowRight' || e.key === 'd') {
        keysPressed.current['right'] = false
      }
    }

    const handleTouchStart = (e: TouchEvent) => {
      if (!gameStateRef.current.isRunning) return
      const touch = e.touches[0]
      const touchX = touch.clientX - canvas.getBoundingClientRect().left

      if (touchX < canvas.width / 2) {
        keysPressed.current['left'] = true
      } else {
        keysPressed.current['right'] = true
      }
    }

    const handleTouchEnd = () => {
      keysPressed.current['left'] = false
      keysPressed.current['right'] = false
    }

    const startGame = () => {
      gameStateRef.current.isRunning = true
      gameStateRef.current.score = 0
      gameStateRef.current.distance = 0
      gameStateRef.current.difficulty = 1
      setIsGameOver(false)
      setGameStarted(true)
      playerRef.current = {
        lane: 1,
        targetLane: 1,
        laneProgress: 0,
      }
      obstaclesRef.current = []

      // Start background music
      if (!bgMusicRef.current) {
        bgMusicRef.current = new Audio('https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Tanden%20in%20de%20Mist-Q4g5oJCLbkEgD4ySF4hMDxaqkx6gcf.mp3')
        bgMusicRef.current.loop = true
        bgMusicRef.current.volume = 0.8
      }
      bgMusicRef.current.currentTime = 0
      bgMusicRef.current.play().catch(() => {
        // Silently fail if audio can't play
      })
    }

    const gameLoop = () => {
      frameCount++

      // Check for game start
      if (!gameStateRef.current.isRunning) {
        ctx.fillStyle = '#1a1a2e'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 48px Arial'
        ctx.textAlign = 'center'
        ctx.fillText('🐴 MONSTER SURFER 🐴', canvas.width / 2, 100)
        ctx.font = '24px Arial'
        ctx.fillText('Click or Press SPACE to Start', canvas.width / 2, 250)
        ctx.font = '18px Arial'
        ctx.fillText('Move LEFT/RIGHT with Arrow Keys or A/D', canvas.width / 2, 310)
        ctx.fillText('Avoid the Monsters!', canvas.width / 2, 350)
        ctx.fillText('High Score: ' + gameStateRef.current.highScore + ' meters', canvas.width / 2, 420)

        if (isGameOver) {
          ctx.fillStyle = '#FF6B6B'
          ctx.font = 'bold 36px Arial'
          ctx.fillText('GAME OVER!', canvas.width / 2, 480)
          ctx.fillStyle = '#ffffff'
          ctx.font = '20px Arial'
          ctx.fillText('Distance: ' + gameStateRef.current.score + ' meters', canvas.width / 2, 530)
        }

        animationId = requestAnimationFrame(gameLoop)
        return
      }

      // Clear canvas with gradient background
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height)
      gradient.addColorStop(0, '#87CEEB')
      gradient.addColorStop(1, '#E0E0E0')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Draw road/lanes
      ctx.fillStyle = '#4a4a4a'
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(i * LANE_WIDTH, 0, LANE_WIDTH, canvas.height)
      }

      // Draw lane dividers
      ctx.strokeStyle = '#FFD700'
      ctx.lineWidth = 3
      ctx.setLineDash([20, 20])
      for (let i = 1; i < 3; i++) {
        ctx.beginPath()
        ctx.moveTo(i * LANE_WIDTH, 0)
        ctx.lineTo(i * LANE_WIDTH, canvas.height)
        ctx.stroke()
      }
      ctx.setLineDash([])

      // Handle player movement
      const player = playerRef.current

      if (keysPressed.current['left'] && player.targetLane > 0) {
        player.targetLane--
        keysPressed.current['left'] = false
      }
      if (keysPressed.current['right'] && player.targetLane < 2) {
        player.targetLane++
        keysPressed.current['right'] = false
      }

      // Smooth lane transition
      if (player.lane !== player.targetLane) {
        const direction = player.targetLane > player.lane ? 1 : -1
        player.laneProgress += 0.2
        if (player.laneProgress >= 1) {
          player.lane = player.targetLane
          player.laneProgress = 0
        }
      }

      // Update game difficulty based on distance
      gameStateRef.current.distance += 1
      gameStateRef.current.difficulty = 1 + gameStateRef.current.distance / 1000
      gameStateRef.current.gameSpeed = 0.012 + gameStateRef.current.difficulty * 0.003

      // Spawn monsters
      if (frameCount % Math.max(50, Math.floor(120 / gameStateRef.current.difficulty)) === 0) {
        const lane = Math.floor(Math.random() * 3)
        const monsterType = Math.floor(Math.random() * 4)
        obstaclesRef.current.push({
          lane,
          depth: 0,
          monsterType,
          width: 60,
          height: 80,
        })
      }

      // Update obstacles
      for (let i = obstaclesRef.current.length - 1; i >= 0; i--) {
        const obstacle = obstaclesRef.current[i]
        obstacle.depth += gameStateRef.current.gameSpeed

        // Collision detection when monster is close
        if (obstacle.depth > 0.8 && obstacle.depth < 1) {
          if (obstacle.lane === player.lane) {
            gameStateRef.current.isRunning = false
            setIsGameOver(true)

            // Stop background music
            if (bgMusicRef.current) {
              bgMusicRef.current.pause()
            }

            // Play death sound
            if (!deathSoundRef.current) {
              deathSoundRef.current = new Audio('https://hebbkx1anhila5yf.public.blob.vercel-storage.com/A_pony_neighs__4-1784111229727-fjE154kxpd0mvrRKPYEt3qWX1RQmRm.mp3')
            }
            deathSoundRef.current.currentTime = 0
            deathSoundRef.current.play().catch(() => {
              // Silently fail if audio can't play
            })

            if (gameStateRef.current.distance > gameStateRef.current.highScore) {
              gameStateRef.current.highScore = gameStateRef.current.distance
              setHighScore(gameStateRef.current.distance)
              localStorage.setItem('monsterSurferHighScore', String(gameStateRef.current.distance))
            }
          }
        }

        // Remove obstacle when past
        if (obstacle.depth > 1) {
          obstaclesRef.current.splice(i, 1)
          // Score increases every meter
          gameStateRef.current.score = gameStateRef.current.distance
          setScore(gameStateRef.current.score)
        }
      }

      // Draw obstacles
      for (const obstacle of obstaclesRef.current) {
        drawMonster(ctx, obstacle)
      }

      // Draw player
      drawHorse(ctx, player, frameCount)

      // Draw UI
      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 24px Arial'
      ctx.textAlign = 'left'
      ctx.fillText('Distance: ' + gameStateRef.current.score + ' m', 20, 30)
      ctx.fillText('Best: ' + gameStateRef.current.highScore + ' m', 20, 60)

      animationId = requestAnimationFrame(gameLoop)
    }

    const handleCanvasClick = () => {
      if (!gameStateRef.current.isRunning && !gameStarted) {
        startGame()
      } else if (isGameOver) {
        startGame()
      }
    }

    const handleSpace = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        if (!gameStateRef.current.isRunning) {
          startGame()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('keydown', handleSpace)
    window.addEventListener('touchstart', handleTouchStart)
    window.addEventListener('touchend', handleTouchEnd)
    canvas.addEventListener('click', handleCanvasClick)

    gameLoop()

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('keydown', handleSpace)
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchend', handleTouchEnd)
      canvas.removeEventListener('click', handleCanvasClick)
      cancelAnimationFrame(animationId)
    }
  }, [gameStarted, isGameOver])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 p-4">
      <h1 className="text-4xl font-bold text-white mb-4">🐴 MONSTER SURFER 🐴</h1>
      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        className="border-4 border-yellow-500 bg-gray-800 shadow-lg"
        style={{ maxWidth: '100%', height: 'auto' }}
      />
      <div className="mt-4 text-white text-center">
        <p className="text-lg">Distance: <span className="font-bold">{score} meters</span></p>
        <p className="text-lg">Best: <span className="font-bold">{highScore} meters</span></p>
        <p className="text-sm mt-2 text-gray-400">Use Arrow Keys or A/D to move left and right</p>
      </div>
    </div>
  )
}
