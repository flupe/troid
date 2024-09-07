// TODOS:

// - have several canvases for gizmos + rendered paths, etc
// - add resize event
// - add menu
// - better brush engine
// - better line smoothing, uniform bezier sampling etc

const on  = (t, es, fn) => {
  if (Array.isArray(es)) {
    es.forEach(e => t.addEventListener(e, fn, false))
  }
  else t.addEventListener(es, fn, false)
}

const lerp = (t, a, b)       => a + t * (b - a)
const bez3 = (t, a, b, c)    => lerp(t, lerp(t, a, b), lerp(t, b, c))
const bez4 = (t, a, b, c, d) => lerp(t, bez3(t, a, b, c), bez3(t, b, c, d))

let scale  = devicePixelRatio
let width  = Math.ceil(document.body.clientWidth  * scale)
let height = Math.ceil(document.body.clientHeight * scale)

const layers = []

function newLayer(){
  const dom = document.createElement('canvas')
  const ctx = dom.getContext('2d')

  dom.width  = width
  dom.height = height

  let layer = {dom, ctx}

  layers.push(layer)

  return layer
}

const screen = newLayer()
document.body.appendChild(screen.dom)

const drawing = newLayer()
drawing.ctx.globalCompositeOperation = "multiply"

const guizmos = newLayer()

let bsize = 7 
let DRAWING = false
let HOVER   = false
let GUIDED  = false
let ANGLE   = 0

// last 2 known positions (w/ 0 being the most recent)
let lasts = [{x:0, y:0, s: 0}, {x:0, y:0, s: 0}]
let mouse = lasts[0]

on(screen.dom, "pointerover", e => { HOVER = true })
on(screen.dom, "pointerdown", async e => {
  DRAWING = true

  GUIDED = e.altKey

  let size = bsize * scale * e.pressure
  let x = e.clientX * scale
  let y = e.clientY * scale

  lasts[0].x = lasts[1].x = x
  lasts[0].y = lasts[1].y = y
  lasts[0].s = lasts[1].s = size

  // for now, let's only care about the front vanishing point
  let dx = x - width / 2
  let dy = height / 2 - y
  ANGLE = Math.atan2(dy, dx)
})

on(screen.dom, "pointermove", async e => {
  HOVER = true

  if (DRAWING) moveBrush(e)
  else {
    mouse.x = e.clientX * scale
    mouse.y = e.clientY * scale
  }

  drawGuizmos()
  draw()
})

on(window, ["pointerup", "blur"], async e => { DRAWING = false })
on(window, "blur", async e => { HOVER = false })

function moveBrush(e) {
  let s = bsize * scale * Math.sqrt(e.pressure)

  let x, y

  if (GUIDED) {
    // sticking mouse to line going to the vp
    let mx = e.clientX * scale
    let my = e.clientY * scale

    let dx = mx - width / 2
    let dy = height / 2 - my

    let ca = Math.cos(ANGLE)
    let sa = Math.sin(ANGLE)

    let p = ca * dx + sa * dy

    x = width  / 2  + ca * p
    y = height / 2  - sa * p
  }
  else {
    x = e.clientX * scale
    y = e.clientY * scale
  }

  // control point as the continuation of the two previous points
  let ctrlx = lasts[0].x + .5 * (lasts[0].x - lasts[1].x)
  let ctrly = lasts[0].y + .5 * (lasts[0].y - lasts[1].y)

  // of course now derivative of the curve is discontinuous at each new point
  // so is it really smoothing?

  const ctx = drawing.ctx
  ctx.globalAlpha = e.pressure

  let steps = Math.max(10, Math.sqrt(Math.pow(x - lasts[0].x, 2) +  Math.pow(y - lasts[0].y, 2)) / 2)

  for (let i = 0; i <= steps; i++) {
    let r = i / steps;

    let xx = bez3(r, lasts[0].x, ctrlx, x)
    let yy = bez3(r, lasts[0].y, ctrly, y)
    let ss = lerp(r, lasts[0].s, s)

    ctx.drawImage(bcvs, 0, 0, bsize, bsize, xx - ss / 2, yy - ss / 2, ss, ss)
  }

  // swap last positions, update
  let l = lasts[1]
  lasts[1] = lasts[0]
  l.x = x
  l.y = y
  l.s = s
  lasts[0] = l
}

function drawGuizmos() {
  const ctx = guizmos.ctx
  ctx.clearRect(0, 0, width, height)
  ctx.save()

  ctx.translate(width / 2, height / 2)
  ctx.scale(1, -1)

  ctx.strokeStyle = "#f0f"
  ctx.lineWidth = 2 * scale

  let dist = Math.min(2 * height / 5, 2 * width / 5)

  // vanishing points

  ctx.beginPath()
  ctx.arc(    0,     0, 5, 0, 2 * Math.PI)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(    0,  dist, 5, 0, 2 * Math.PI)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(    0, -dist, 5, 0, 2 * Math.PI)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc( dist,     0, 5, 0, 2 * Math.PI)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(-dist,     0, 5, 0, 2 * Math.PI)
  ctx.stroke()
  ctx.lineWidth = scale
  ctx.beginPath()
  ctx.arc(0, 0, dist, 0, 2 * Math.PI)
  ctx.stroke()

  let dx = mouse.x - width / 2
  let dy = height / 2 - mouse.y

  // perspective lines
  ctx.strokeStyle = '#0ff'

  if (HOVER) {
    ctx.beginPath()
    let angle = DRAWING ? ANGLE : Math.atan2(dy, dx)
    let ca = Math.cos(angle)
    let sa = Math.sin(angle)

    let p = dx * ca + dy * sa

    ctx.moveTo(ca * Math.max(20, p - 50), sa * Math.max(20, p - 50))
    ctx.lineTo(ca * Math.max(20, p + 50), sa * Math.max(20, p + 50))
    ctx.stroke()
  }

  ctx.restore()
}

// update the entire display
function draw() {
  screen.ctx.clearRect(0, 0, width, height)
  screen.ctx.drawImage(drawing.dom, 0, 0)
  screen.ctx.drawImage(guizmos.dom, 0, 0)
}

// basic brush shape canvas
let bcvs = document.createElement("canvas")
let bctx = bcvs.getContext("2d")

bcvs.width  = bsize
bcvs.height = bsize

let grad = bctx.createRadialGradient(bsize / 2, bsize / 2, bsize / 4,
                                     bsize / 2, bsize / 2, bsize / 2)

grad.addColorStop(0, "#000")
grad.addColorStop(1, "transparent")

bctx.fillStyle = grad
bctx.fillRect(0, 0, bsize, bsize)

drawGuizmos()
draw()
