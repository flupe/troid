// TODOS:

// - add resize event
// - add menu
// - better brush engine
// - better line smoothing, uniform bezier sampling etc

// -----------------------------------------------------------------------------
// utils
// -----

const on = (t, es, fn) => {
  if (Array.isArray(es)) {
    es.forEach(e => t.addEventListener(e, fn, false))
  }
  else t.addEventListener(es, fn, false)
}

const {ceil, sin, cos, atan2, PI, sqrt, pow, min, max} = Math

const lerp = (t, a, b)       => a + t * (b - a)
const bez3 = (t, a, b, c)    => lerp(t, lerp(t, a, b), lerp(t, b, c))
const bez4 = (t, a, b, c, d) => lerp(t, bez3(t, a, b, c), bez3(t, b, c, d))

// -----------------------------------------------------------------------------
// setup
// -----

const SCALE = devicePixelRatio

function layer() {
  let dom = document.createElement("canvas")
  let ctx = dom.getContext("2d")
  return {dom, ctx}
}

// viewport & canvas setup
const viewport = layer()
const canvas   = layer()

// viewport dimensions
let width  = canvas.width  = ceil(document.body.clientWidth  * SCALE)
let height = canvas.height = ceil(document.body.clientHeight * SCALE)

// initial g sizing, to make updatable?
const GIZMO_SIZE = Math.min(2 * height / 5, 2 * width / 5)

canvas.ctx.globalCompositeOperation = "multiply"

viewport.dom.width  = canvas.dom.width  = width
viewport.dom.height = canvas.dom.height = height

document.body.appendChild(viewport.dom)

const BRUSH_SIZE = 7  // TODO: make it configurable
let DRAWING = false
let HOVER   = false
let GUIDED  = false
let GUIDE   = null
let ANGLE   = 0

let mouse = {
  x: 0,  // x, y : absolute top-left window coords
  y: 0,
  dx: 0, // dx, dy : viewport-local scale-adjusted coords
  dy: 0,
}

const gizmos = []

// -----------------------------------------------------------------------------
// event handlers
// --------------

function mouseCoords(e) {
  mouse.x = e.clientX * SCALE
  mouse.y = e.clientY * SCALE

  mouse.dx = mouse.x - width / 2
  mouse.dy = height / 2 - mouse.y
}

on(viewport.dom, "pointerover", e => { HOVER = true })
on(viewport.dom, "pointerdown", async e => {
  DRAWING = true
  GUIDED = e.altKey
  GUIDE = null

  mouseCoords(e)
  brushStart(e)

  // getting gizmo angle
  // if (GUIDED) ANGLE = atan2(mouse.dy, mouse.dx)
})

on(viewport.dom, "pointermove", async e => {
  HOVER = true
  mouseCoords(e)

  if (DRAWING) moveBrush(e)

  draw()
})

on(window, ["pointerup", "blur"], e => { DRAWING = false })
on(window, "blur", e => { HOVER = false })

on(window, "resize", e => {
  width  = viewport.dom.width  = ceil(document.body.clientWidth  * SCALE)
  height = viewport.dom.height = ceil(document.body.clientHeight * SCALE)
  draw()
})

on(saveBtn, "click", async e => {
  let blob = await new Promise(r => canvas.dom.toBlob(r))

  if ("showSaveFilePicker" in window) {
    let now = new Date().toISOString()
    let handle = await window.showSaveFilePicker({
      startIn: "pictures",
      suggestedName: `troid-${now}.png`,
      types: [{ description: "Image file", accept: { "image/png": [".png"] } }],
    })
    let stream = await handle.createWritable()
    await stream.write(blob)
    await stream.close()
  }

  else window.location = URL.createObjectURL(blob)
})

// -----------------------------------------------------------------------------
// brush "engine"
// --------------

// basic brush texture
let brush = layer()

brush.dom.width  = brush.dom.height = BRUSH_SIZE

let grad = brush.ctx.createRadialGradient(
  BRUSH_SIZE / 2, BRUSH_SIZE / 2, BRUSH_SIZE / 4,
  BRUSH_SIZE / 2, BRUSH_SIZE / 2, BRUSH_SIZE / 2
)

grad.addColorStop(0, "#000")
grad.addColorStop(1, "transparent")

brush.ctx.fillStyle = grad
brush.ctx.fillRect(0, 0, BRUSH_SIZE, BRUSH_SIZE)

// last 2 known positions (w/ 0 being the most recent)
let lasts = [{x:0, y:0, s: 0}, {x:0, y:0, s: 0}]

function brushStart(e) {
  // starting new brush stroke
  let size = BRUSH_SIZE * SCALE * sqrt(e.pressure)
  lasts[0].x = lasts[1].x = mouse.dx
  lasts[0].y = lasts[1].y = mouse.dy
  lasts[0].s = lasts[1].s = size
}

function moveBrush(e) {
  const ctx = canvas.ctx

  ctx.save()
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.scale(1, -1)

  let s = BRUSH_SIZE * SCALE * sqrt(e.pressure)

  // we haven't found a guide yet
  if (GUIDED && GUIDE === null) {
    let ddx = mouse.dx - lasts[0].x
    let ddy = mouse.dy - lasts[0].y

    let score = 0
    gizmos.forEach(gizmo => {
      let s = gizmo.score(ddx, ddy)
      if (s > score) {
        score = s
        GUIDE = gizmo
      }
    })
  }

  if (GUIDED && GUIDE) GUIDE.snap()

  let x = mouse.dx
  let y = mouse.dy
  

  // control point as the continuation of the two previous points
  let ctrlx = lasts[0].x + .5 * (lasts[0].x - lasts[1].x)
  let ctrly = lasts[0].y + .5 * (lasts[0].y - lasts[1].y)

  // of course now derivative of the curve is discontinuous at each new point

  ctx.globalAlpha = e.pressure

  let steps = Math.max(10, Math.sqrt(Math.pow(x - lasts[0].x, 2) +  Math.pow(y - lasts[0].y, 2)) / 2)

  for (let i = 0; i <= steps; i++) {
    let r = i / steps;

    let xx = bez3(r, lasts[0].x, ctrlx, x)
    let yy = bez3(r, lasts[0].y, ctrly, y)
    let ss = lerp(r, lasts[0].s, s)

    ctx.drawImage(brush.dom, 0, 0, BRUSH_SIZE, BRUSH_SIZE, xx - ss / 2, yy - ss / 2, ss, ss)
  }

  // swap last positions, update
  let l = lasts[1]
  lasts[1] = lasts[0]
  l.x = x
  l.y = y
  l.s = s
  lasts[0] = l
  ctx.restore()
}

// -----------------------------------------------------------------------------
// gizmos
// ------

function drawGizmos() {
  const ctx = viewport.ctx

  ctx.strokeStyle = "#f0f"
  ctx.lineWidth = 2 * SCALE

  /*
  ctx.beginPath()
  ctx.arc(    0,     0, 5, 0, 2 * Math.PI)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(    0,  GIZMO_SIZE, 5, 0, 2 * Math.PI)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(    0, -GIZMO_SIZE, 5, 0, 2 * Math.PI)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc( GIZMO_SIZE,     0, 5, 0, 2 * Math.PI)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(-GIZMO_SIZE,     0, 5, 0, 2 * Math.PI)
  ctx.stroke()
  ctx.lineWidth = SCALE
  ctx.beginPath()
  ctx.arc(0, 0, GIZMO_SIZE, 0, 2 * Math.PI)
  ctx.stroke()
  */

  let dx = mouse.x - width / 2
  let dy = height / 2 - mouse.y

  // perspective lines
  ctx.strokeStyle = '#0ff'


}

function draw() {
  let ctx = viewport.ctx
  ctx.clearRect(0, 0, width, height)

  ctx.save()
  // TODO: viewport offset
  ctx.translate(width / 2, height / 2)
  // TODO: viewport zoom

  ctx.fillStyle = '#aaa'
  ctx.fillRect(-canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height)
  ctx.drawImage(canvas.dom, -canvas.width / 2, -canvas.height / 2)
  ctx.scale(1, -1)

  // drawGizmos()
  gizmos.forEach(gizmo => gizmo.draw(ctx))

  ctx.restore()
}

class Gizmo {
  constructor() {}
  update() {}
  draw() {}
  correct() {}
}

class PointGizmo extends Gizmo {
  constructor(x, y, colour = '#f0f') {
    super()
    this.x = x
    this.y = y
    this.angle = 0
    this.colour = colour
  }

  snap() {
    let dx = mouse.dx - this.x
    let dy = mouse.dy - this.y

    let ca = cos(this.angle)
    let sa = sin(this.angle)
    let p  = dx * ca + dy * sa

    mouse.dx = this.x + p * ca
    mouse.dy = this.y + p * sa
  }

  // compute closeness score to guide
  score(ddx, ddy) {
    if (ddx == 0 && ddy == 0) return 0

    // [ddx ddy] is the displacement vector of the first stroke mvmnt
    let dx = mouse.dx - this.x
    let dy = mouse.dy - this.y
    let l1 = dx * dx + dy * dy
    let l2 = ddx * ddx + ddy * ddy

    this.angle = atan2(dy, dx)
    return Math.abs(dx * ddx + dy * ddy) / sqrt(l1 * l2)
  }

  draw(ctx) {
    ctx.strokeStyle = this.colour
    ctx.lineWidth = SCALE

    // draw vanishing point
    ctx.beginPath()
    ctx.arc(this.x, this.y, 5, 0, 2 * PI)
    ctx.stroke()

    // draw cursor snap guide
    let dx = mouse.dx - this.x
    let dy = mouse.dy - this.y

    ctx.beginPath()
    let angle = atan2(dy, dx)

    let ca = cos(angle)
    let sa = sin(angle)
    let p  = dx * ca + dy * sa

    ctx.moveTo(this.x + ca * max(20, p - 50), this.y + sa * max(20, p - 50))
    ctx.lineTo(this.x + ca * max(20, p + 50), this.y + sa * max(20, p + 50))
    ctx.stroke()
  }
}

gizmos.push(new PointGizmo(0, -height / 3))
gizmos.push(new PointGizmo(- height / 3, height / 4, '#ff0'))
gizmos.push(new PointGizmo(  height / 3, height / 4, '#0ff'))

draw()
