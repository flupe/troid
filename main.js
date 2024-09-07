// TODOS:

// - have several canvases for gizmos + rendered paths, etc
// - add resize event
// - add menu
// - better brush engine
// - better line smoothing

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

let bsize = 10
let DRAWING = false

// last 2 known positions (w/ 0 being the most recent)
let lasts = [{x:0, y:0, s: 0}, {x:0, y:0, s: 0}]

on(screen.dom, "pointerdown", async e => {
  DRAWING = true

  let size = bsize * scale * e.pressure
  let x = e.clientX / scale
  let y = e.clientY / scale

  lasts[0].x = lasts[1].x = x
  lasts[0].y = lasts[1].y = y
  lasts[0].s = lasts[1].s = size
})

on(screen.dom, "pointermove", async e => {
  if (!DRAWING) return

  moveBrush(e)
  draw()
})

on(window, ["mouseup", "blur"], async e => { DRAWING = false })

function moveBrush(e) {
  let s = bsize * scale * Math.sqrt(e.pressure)
  let x = e.clientX / scale
  let y = e.clientY / scale

  // control point as the continuation of the two previous points
  let ctrlx = lasts[0].x + .5 * (lasts[0].x - lasts[1].x)
  let ctrly = lasts[0].y + .5 * (lasts[0].y - lasts[1].y)

  // of course now derivative of the curve is discontinuous at each new point
  // so is it really smoothing?

  const ctx = drawing.ctx
  ctx.globalAlpha = e.pressure

  for (let i = 0; i <= 10; i++) {
    let r = i / 10;

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
