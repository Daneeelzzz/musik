;(() => {
  const audioEl = document.getElementById("audioEl")
  const loadBtn = document.getElementById("loadBtn")
  const playBtn = document.getElementById("playBtn")
  const prevBtn = document.getElementById("prevBtn")
  const nextBtn = document.getElementById("nextBtn")
  const stopBtn = document.getElementById("stopBtn")
  const volumeEl = document.getElementById("volume")
  const progressBar = document.getElementById("progressBar")
  const progressFill = document.getElementById("progressFill")
  const elapsedEl = document.getElementById("elapsed")
  const durationEl = document.getElementById("duration")
  const titleEl = document.getElementById("trackTitle")
  const artistEl = document.getElementById("trackArtist")
  const albumArtEl = document.getElementById("albumArt")
  const playlistEl = document.getElementById("playlist")
  const splash = document.getElementById("splash")
  const vizCanvas = document.getElementById("vizCanvas")
  const ctx = vizCanvas.getContext("2d")

  // UI button click SFX
  const clickSfx = new Audio("./assets/audio/click.mp3")
  clickSfx.volume = 0.3

  const playClick = () => {
    // avoid overlapping clicks too loudly
    try {
      clickSfx.currentTime = 0
      clickSfx.play().catch(() => {})
    } catch {}
  }

  // AudioContext + graph
  let audioCtx
  let srcNode
  let gainNode
  let analyser

  // State
  const playlist = [] // { path, url, name }
  let currentIndex = -1
  let rafId

  // Splash: small intro then hide
  window.addEventListener("load", () => {
    setTimeout(() => {
      splash.style.display = "none"
    }, 1600)
  })

  // Initialize context lazily to respect autoplay policies
  function ensureAudioGraph() {
    if (audioCtx) return
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    srcNode = audioCtx.createMediaElementSource(audioEl)
    gainNode = audioCtx.createGain()
    analyser = audioCtx.createAnalyser()

    analyser.fftSize = 256 // small FFT for simple beat viz
    srcNode.connect(analyser)
    analyser.connect(gainNode)
    gainNode.connect(audioCtx.destination)
  }

  // Helpers
  function formatTime(s) {
    if (!isFinite(s)) return "0:00"
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec < 10 ? "0" : ""}${sec}`
  }

  function basename(p) {
    try {
      // Handles Win/Linux/Mac
      return p.split(/[/\\]/).pop() || p
    } catch {
      return p
    }
  }

  function deriveTitleArtist(name) {
    // Try "Artist - Title" split, else use full as title
    const parts = name.split(" - ")
    if (parts.length >= 2) {
      return { artist: parts[0], title: parts.slice(1).join(" - ") }
    }
    return { artist: "Unknown Artist", title: name.replace(/\.[^/.]+$/, "") }
  }

  // Playlist rendering
  function renderPlaylist() {
    playlistEl.innerHTML = ""
    playlist.forEach((item, idx) => {
      const li = document.createElement("li")
      li.className = "playlist-item" + (idx === currentIndex ? " active" : "")
      li.setAttribute("role", "button")
      li.setAttribute("tabindex", "0")
      const { artist, title } = deriveTitleArtist(item.name)
      li.textContent = `${title} — ${artist}`
      li.addEventListener("click", () => {
        playClick()
        loadAndPlay(idx)
      })
      li.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          playClick()
          loadAndPlay(idx)
        }
      })
      playlistEl.appendChild(li)
    })
  }

  function setNowPlayingByIndex(idx) {
    currentIndex = idx
    const item = playlist[currentIndex]
    if (!item) return
    const { artist, title } = deriveTitleArtist(item.name)
    titleEl.textContent = title
    artistEl.textContent = artist
    Array.from(playlistEl.children).forEach((child, cidx) => {
      child.classList.toggle("active", cidx === currentIndex)
    })
  }

  async function loadAndPlay(idx) {
    if (idx < 0 || idx >= playlist.length) return
    ensureAudioGraph()

    setNowPlayingByIndex(idx)

    const url = playlist[idx].url
    audioEl.src = url
    try {
      await audioEl.play()
      playBtn.textContent = "⏸"
    } catch (e) {
      // wait for user gesture
      playBtn.textContent = "▶"
    }
  }

  function playPause() {
    ensureAudioGraph()
    if (audioEl.paused) {
      audioEl.play().catch(() => {})
      playBtn.textContent = "⏸"
    } else {
      audioEl.pause()
      playBtn.textContent = "▶"
    }
  }

  function stopPlayback() {
    audioEl.pause()
    audioEl.currentTime = 0
    playBtn.textContent = "▶"
  }

  function nextTrack() {
    if (!playlist.length) return
    const next = (currentIndex + 1) % playlist.length
    loadAndPlay(next)
  }

  function prevTrack() {
    if (!playlist.length) return
    const prev = (currentIndex - 1 + playlist.length) % playlist.length
    loadAndPlay(prev)
  }

  // Events
  loadBtn.addEventListener("click", async () => {
    playClick()
    const paths = await window.electronAPI.openAudioFiles()
    if (!paths || !paths.length) return

    // Map to URL for audio element
    const items = paths.map((p) => ({
      path: p,
      url: window.electronAPI.toFileURL(p),
      name: basename(p),
    }))

    playlist.push(...items)
    renderPlaylist()

    // Autoplay first if nothing currently loaded
    if (currentIndex === -1) {
      loadAndPlay(0)
    }
  })

  playBtn.addEventListener("click", () => {
    playClick()
    playPause()
  })
  stopBtn.addEventListener("click", () => {
    playClick()
    stopPlayback()
  })
  nextBtn.addEventListener("click", () => {
    playClick()
    nextTrack()
  })
  prevBtn.addEventListener("click", () => {
    playClick()
    prevTrack()
  })

  volumeEl.addEventListener("input", (e) => {
    ensureAudioGraph()
    const v = Number.parseFloat(e.target.value)
    gainNode.gain.value = v
  })

  // Seek on progress bar click
  progressBar.addEventListener("click", (e) => {
    const rect = progressBar.getBoundingClientRect()
    const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1)
    if (isFinite(audioEl.duration)) {
      audioEl.currentTime = audioEl.duration * ratio
    }
  })

  // Audio events
  audioEl.addEventListener("loadedmetadata", () => {
    durationEl.textContent = formatTime(audioEl.duration || 0)
  })

  audioEl.addEventListener("ended", () => {
    nextTrack()
  })

  // Progress + simple beat visualization via rAF
  function loop() {
    // Progress
    const cur = audioEl.currentTime || 0
    const dur = audioEl.duration || 0
    elapsedEl.textContent = formatTime(cur)
    durationEl.textContent = formatTime(dur)
    const pct = dur > 0 ? (cur / dur) * 100 : 0
    progressFill.style.width = `${pct}%`

    // Visualizer
    if (analyser && ctx) {
      const w = (vizCanvas.width = vizCanvas.clientWidth)
      const h = (vizCanvas.height = vizCanvas.clientHeight)
      const bufferLength = analyser.frequencyBinCount
      const data = new Uint8Array(bufferLength)
      analyser.getByteFrequencyData(data)

      // Compute intensity
      let sum = 0
      for (let i = 0; i < bufferLength; i++) sum += data[i]
      const intensity = sum / bufferLength / 255 // 0..1

      // Background flash overlay effect
      ctx.clearRect(0, 0, w, h)
      const bars = Math.min(64, bufferLength)
      const barW = w / bars
      for (let i = 0; i < bars; i++) {
        const v = data[i] / 255
        const barH = v * h
        ctx.fillStyle = `rgba(230, 0, 18, ${0.15 + v * 0.35})`
        ctx.fillRect(i * barW, h - barH, barW * 0.8, barH)
      }

      // Pulse album art subtly
      const scale = 1 + intensity * 0.06
      albumArtEl.style.transform = `scale(${scale})`
    }

    rafId = requestAnimationFrame(loop)
  }
  rafId = requestAnimationFrame(loop)

  // Example default track for testing (optional)
  // If user has no songs loaded yet, we can set a sample track.
  // Comment out if not desired.
  ;(function loadSample() {
    const sample = {
      path: "./assets/audio/sample.mp3",
      url: "./assets/audio/sample.mp3",
      name: "Sample Artist - Sample Track.mp3",
    }
    playlist.push(sample)
    renderPlaylist()
    if (currentIndex === -1) setNowPlayingByIndex(0)
  })()
})()
