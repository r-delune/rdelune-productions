import { createParticleCluster } from "../sketches/utility/particles.js"
import p5 from "p5"
import "assets/addons/p5.dom"
import "assets/addons/p5.sound.js"

import { getCurrEventFromBPM } from "../sketches/utility/tools.js"
import { Notify } from "quasar"
let song
import { Platform } from "quasar"

import { useQuasar } from "quasar"
export default function roamer({
  height,
  width,
  sketch,
  fade,
  trackSpec,
  emitter,
  songPlayHead,
  playStart,
  activeVisualiser,
  env,
  store,
}) {
  console.log("*****ROAMER*****")
  const $q = useQuasar()
  let fft
  let particles = []
  let ambientparticles = [[0][0]]
  let sketchimage
  let font
  let theShader
  let shadeBalls = []
  let shaderStuff
  let canvas
  let peakDetect
  let eventNo = 0
  let soundLoop
  // let triggerBeat
  // function triggerBeat() {
  //   console.log("trigger bea!!!!!s")
  // }

  // function onSoundLoop(timeFromNow) {
  //   // let noteIndex = (soundLoop.iterations - 1) % notePattern.length
  //   // let note = midiToFreq(notePattern[noteIndex])
  //   // synth.play(note, 0.5, timeFromNow)
  //   // sketch.background((noteIndex * 360) / notePattern.length, 50, 100)
  //   // let noteIndex = (soundLoop.iterations - 1) % notePattern.length
  //   // let note = midiToFreq(notePattern[noteIndex])
  //   // synth.play(note, 0.5, timeFromNow)
  //   sketch.background(1 / 1, 50, 100)
  //   console.log("SOUNDLOOP", timeFromNow)
  // }

  sketch.preload = () => {
    store.commit("audio/SET_IS_LOADING", true)

    song = sketch.loadSound("wormhole/mp3s/" + trackSpec.track_name)
    store.commit("audio/SET_SONG", song)

    if (env.NODE_ENV == "production") {
      song = sketch.loadSound(trackSpec.track_name)
    }

    if (
      trackSpec.hasOwnProperty("config") &&
      trackSpec.config.hasOwnProperty("isWebGL") &&
      trackSpec.config.isWebGL == true
    ) {
      font = sketch.loadFont("college.ttf")
      if (trackSpec.config.hasOwnProperty("shadeBalls")) {
        shaderStuff = { theShader: sketch.loadShader("vert.glsl", "frag.glsl") }
      }
    }

    try {
      let image = JSON.parse(JSON.stringify(trackSpec.config.imagefile))
      sketchimage = sketch.loadImage("images/" + image)
    } catch (e) {
      // console.log("no image in this file", trackSpec.config)
    }
  }

  //  set up this invirnoment
  sketch.setup = () => {
    sketch.disableFriendlyErrors = true
    // sketch.debugMode()

    // how does this work????
    // try {
    // // if (trackSpec.hasOwnProperty("soundloop")) {
    // let intervalInSeconds = 0.2
    // soundLoop = new p5.SoundLoop(onSoundLoop, intervalInSeconds)
    // console.log("STARTED SOUNDLOOP", soundLoop)
    // soundLoop.start()
    // }

    // try {
    if (
      trackSpec.hasOwnProperty("config") &&
      trackSpec.config.hasOwnProperty("isWebGL") &&
      trackSpec.config.isWebGL == true
    ) {
      sketch.textFont(font, 100)
      canvas = sketch.createCanvas(width, height, sketch.WEBGL)
      sketch.angleMode(sketch.DEGREES)
      sketch.textAlign(sketch.CENTER, sketch.CENTER)
      sketch.colorMode(sketch.HSB)
      sketch.pixelDensity(1)
      if (trackSpec.config.hasOwnProperty("shadeBalls")) {
        for (let i = 0; i < 3; i++) {
          shadeBalls.push({
            vel: [sketch.random(), sketch.random()],
            pos: [sketch.random(width), sketch.random(height)],
          })
        }
        shaderStuff.shadeBalls = shadeBalls
      }
    } else {
      canvas = sketch.createCanvas(width, height)
    }

    canvas.touchStarted(touchResp) // attach

    try {
      if (trackSpec.config.colorVortext) {
        sketch.colorMode(sketch.HSL, 1)
      }
    } catch (e) {}

    fade = 0
    emitter.all.delete("changeSongState")
    emitter.on("changeSongState", (value) => {
      console.log("CUED CHANGE SONG STATE", value)

      if (value == "nexttrack") {
        song.stop()

        // emitter.emit("changeSongState", "nexttrack")
        // emitter.emit("changedTrack", 1)
        store.commit("audio/SET_IS_PLAYING", false)

        emitter.emit("changePlayIcon", "stopped")
      } else if (song.isPlaying() && value == "paused") {
        console.log("SONG IS PLAYING, NOW IT IS PAUSED")
        song.pause()

        // Notify.create({
        //   timeout: 2000,
        //   position: "right",
        //   color: "primary",

        store.commit("audio/SET_IS_PLAYING", false)
        //   message: "Paused",
        // })
        // emitter.emit("toggleNav", true

        emitter.emit("changePlayIcon", "paused")
      } else if (song.isPaused() && value == "playing") {
        console.log("detected song is paused, unpausing", value)
        song.play()

        // Notify.create({
        //   timeout: 1000,
        //   position: "right",
        //   color: "primary",
        // //   message: "Playing: " + trackSpec.song_name,
        // // })
        // emitter.emit("toggleNav", false)
        emitter.emit("changePlayIcon", "playing")

        store.commit("audio/SET_IS_PLAYING", true)
      } else if (song.isPlaying() == false) {
        console.log("detected song is stopped, playing (+ restarting)", value)

        try {
          song.play()
          store.commit("audio/SET_IS_PLAYING", true)
          // emitter.emit("restartAll")
          // emitter.emit("toggleNav", false)
        } catch (e) {
          console.log("SONG FAIL", e)
          // emitter.emit("changedTrack", 1)
          store.commit("audio/SET_IS_PLAYING", false)
        }
      }

      store.commit("audio/SET_SONG", song)
    })

    emitter.all.delete("emitChangeVolume")
    emitter.on("emitChangeVolume", (value) => {
      console.log("inner volume", value)
      song.setVolume(value, 0)
    })

    // jump song function, with fix
    emitter.all.delete("jumpSong")
    emitter.on("jumpSong", (value) => {
      try {
        setTimeout(function () {
          Object.assign(song, { _playing: true })
          song.playMode("restart")
        }, 100)
        song.stop()
        song.playMode("sustain")
        let one_bar_in_seconds = (60 / trackSpec.bpm) * 4 // length of 1 beat
        let goto = trackSpec.events[value] * one_bar_in_seconds
        // console.log("go yo :", goto)
        song.jump(goto)

        setTimeout(function () {
          Object.assign(song, { _playing: true })
        }, 100)
      } catch (e) {
        console.log(e)
      }
    })

    fft = new p5.FFT()

    // if (trackSpec.config.peakDetect == true) {
    //   console.log("SETUP PEAK DETEC")
    //   // peakDetect = new p5.PeakDetect()

    //   peakDetect = new p5.PeakDetect(20, 20000, 0.02, 20)
    //   // peakDetect.onPeak(triggerBeat)
    // }

    if (song.isLoaded()) {
      songPlayHead = song.currentTime()

      sketch.setBPM(trackSpec.bpm)
      song.onended(function sayDone(elt) {
        console.log(
          "This tack has ended. Should cue next song (disabled) ",
          song.currentTime(),
          trackSpec.totalDuration
        )
        // if (song.currentTime() >= trackSpec.totalDuration) {
        //   emitter.emit("changedTrack", 1)

        //   setTimeout(function () {
        //     emitter.emit("changeSongState", this.playingState)
        //   }, 2000)
        // }
      })
    }

    try {
      if (trackSpec.config.particlesInFile == true) {
        particles = createParticleCluster(sketch, height, width, 500)
        // console.log("paricles", particles)
      } else if (trackSpec.config.ambientParticles == true) {
        // TODO: this should go to setup, move
        let ambientparticles1 = []
        let ambientparticles2 = []
        for (var i = 0; i < 300; i++) {
          ambientparticles1.push(sketch.createVector(0, sketch.random(0, height)))
          ambientparticles2.push(sketch.createVector(0, sketch.random(0, height)))
        }

        ambientparticles = { particles1: ambientparticles1, particles2: ambientparticles2 }
      }
    } catch (e) {
      console.log("no particles in this file", e)
    }

    store.commit("audio/SET_IS_LOADING", false)
  }

  sketch.draw = () => {
    // sketch.text("press space to play", sketch.CENTER, sketch.CENTER)
    // only draw when song is loaded
    if (song.isLoaded() && fft) {
      try {
        fft.analyze()

        if (trackSpec.config.peakDetect == true) {
          // console.log("updating peak")
          // peakDetect.update(fft)
          // console.log("updating peak", peakDetect)
          // if (peakDetect.isDetected == true) {
          //   // console.log("updating peak111111")
          // }
        }
      } catch (e) {
        console.log("fft issue..", fft, e)
        emitter.emit("restartAll")
      }
    } else {
      return
    }
    let foundEvent = getCurrEventFromBPM(song.currentTime(), trackSpec.events, trackSpec.bpm)

    // if (foundEvent != eventNo) {
    //   eventNo = foundEvent
    //   emitter.emit("eventChanged")
    // }

    var requiredStuff = {
      height: height,
      width: width,
      s: sketch,
      fade: fade,
      songEvents: trackSpec.events,
      bpm: trackSpec.bpm,
      song: song,
      fft: fft,
      waveData: {
        bass: fft.getEnergy("bass"),
        treble: fft.getEnergy("treble"),
        mid: fft.getEnergy("mid"),
      },
      playStart: songPlayHead,
      particles: particles,
      image: sketchimage,
      ambientparticles: ambientparticles,
      shaderStuff: shaderStuff,
      canvas: canvas,
      peakDetect: peakDetect,
      eventNo,
      soundLoop: soundLoop,
    }
    emitter.emit("updateSongTime", song.currentTime())

    try {
      activeVisualiser.default(requiredStuff)
    } catch (e) {
      console.log("cant catch it. might try restart..", e)
    }
  }

  //  to touch or click
  function touchResp(event) {
    if (!Platform.is.mobile) {
      console.log("touchResp clicked! This is desktop - skipping")
      return
    }
    console.log("touchResp STARTED", song.isPaused(), song.isPlaying())

    if (song.isPaused() === false || song.isPlaying() === true) {
      console.log("touchResp allowing pause as song is not paused", event)

      emitter.emit("changeSongState", "paused")
    } else if (song.isPlaying() == true || song.isPaused() === true) {
      console.log("touchResp song is playing. pausing", event)
      emitter.emit("changeSongState", "playing")
    }

    return false
  }

  // respond to touch or click
  sketch.doubleClicked = (event) => {
    console.log("doubleClicked", song.isPaused(), song.isPlaying())

    // else pause
    // emitter.emit("changeSongState", "playing")
    console.log("THIS IS A DOUBLE CLICK")
    emitter.emit("cheatPlayToggle")

    // if (song.isPlaying() === true) {
    //   console.log("the song seems to be playing. stting to paused...", event)

    //   emitter.emit("changeSongState", "paused")
    // } else if (song.isPlaying() == false) {
    //   console.log("the song seems to be playing. stting to paused...", event)

    //   emitter.emit("changeSongState", "playing")
    // }

    // console.log("play toggle is " + this.playingState)
    // if (this.playingState === "playing") {
    //   Loading.hide()
    //   this.playingState = "paused"
    // } else if (this.playingState === "stopped" || this.playingState === "paused") {
    //   this.playingState = "playing"
    // }
    // emitter.emit("changeSongState", this.playingState)

    return false
  }

  // respond to touch or click (for mobile)
  sketch.touchMoved = (event) => {
    if (!Platform.is.mobile) {
      console.log("touchMoved cued on desktop - cueing cheatPlayToggle")
      emitter.emit("cheatPlayToggle")

      return
    }

    try {
      console.log("TOUCH MOVED this is mobile", event.touches[0].clientX)
      let tocuhlocation = event.touches[0].clientX

      if (tocuhlocation <= -120) {
        console.log("CUED left", event.movementX)
        emitter.emit("changedTrack", -1)
        return false
      } else if (tocuhlocation >= 120) {
        console.log("CUED right", event.movementX)
        emitter.emit("changedTrack", 1)
        return false
      }
    } catch (e) {
      console.log("touch move failed - is this because you are on desktop?")
    }

    return false
  }
}

export { roamer }
