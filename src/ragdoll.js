import Matter from 'matter-js'
const { Engine, World, Bodies, Body, Constraint } = Matter

const UA=90, FA=85, TH=95, SH=88, TORSO=120, SW=62, HW=46

export class Ragdoll {
  constructor() {
    this.engine  = Engine.create({ gravity: { x:0, y:3 } })
    this.world   = this.engine.world
    this.bodies  = null
    this.active  = false
    this.onLand  = null
    this.matY    = 0
  }

  activate(pose, matY) {
    if (this.active) return
    World.clear(this.world)
    Engine.clear(this.engine)
    this.matY   = matY
    this.active = true

    const opt = { frictionAir:0.12, friction:0.5, restitution:0.1, collisionFilter:{ category:0x0001, mask:0x0002 } }
    const B = (x,y,w,h,label) => Bodies.rectangle(x,y,w,h,{...opt,label})

    const torso  = B(pose.neck.x,    (pose.neck.y+pose.pelvis.y)/2, SW+10, TORSO, 'torso')
    const uArmL  = B((pose.lShoulder.x+pose.lElbow.x)/2, (pose.lShoulder.y+pose.lElbow.y)/2, UA, 10, 'uArmL')
    const uArmR  = B((pose.rShoulder.x+pose.rElbow.x)/2, (pose.rShoulder.y+pose.rElbow.y)/2, UA, 10, 'uArmR')
    const fArmL  = B((pose.lElbow.x+pose.lHand.x)/2, (pose.lElbow.y+pose.lHand.y)/2, FA, 8,  'fArmL')
    const fArmR  = B((pose.rElbow.x+pose.rHand.x)/2, (pose.rElbow.y+pose.rHand.y)/2, FA, 8,  'fArmR')
    const thighL = B((pose.lHip.x+pose.lKnee.x)/2, (pose.lHip.y+pose.lKnee.y)/2, 10, TH, 'thighL')
    const thighR = B((pose.rHip.x+pose.rKnee.x)/2, (pose.rHip.y+pose.rKnee.y)/2, 10, TH, 'thighR')
    const shinL  = B((pose.lKnee.x+pose.lFoot.x)/2, (pose.lKnee.y+pose.lFoot.y)/2, 8,  SH, 'shinL')
    const shinR  = B((pose.rKnee.x+pose.rFoot.x)/2, (pose.rKnee.y+pose.rFoot.y)/2, 8,  SH, 'shinR')

    Body.setVelocity(torso, { x:(Math.random()-0.5)*3, y:4 })

    this.bodies = { torso, uArmL, uArmR, fArmL, fArmR, thighL, thighR, shinL, shinR }
    World.add(this.world, Object.values(this.bodies))

    const J = (bA,pA,bB,pB) => Constraint.create({
      bodyA:bA, pointA:pA, bodyB:bB, pointB:pB,
      stiffness:0.6, length:2, damping:0.2
    })
    World.add(this.world, [
      J(torso,  {x:-SW/2, y:-TORSO/2+20}, uArmL,  {x: UA/2, y:0}),
      J(torso,  {x: SW/2, y:-TORSO/2+20}, uArmR,  {x:-UA/2, y:0}),
      J(uArmL,  {x:-UA/2, y:0},           fArmL,  {x: FA/2, y:0}),
      J(uArmR,  {x: UA/2, y:0},           fArmR,  {x:-FA/2, y:0}),
      J(torso,  {x:-HW/2, y: TORSO/2},    thighL, {x:0, y:-TH/2}),
      J(torso,  {x: HW/2, y: TORSO/2},    thighR, {x:0, y:-TH/2}),
      J(thighL, {x:0, y:TH/2},            shinL,  {x:0, y:-SH/2}),
      J(thighR, {x:0, y:TH/2},            shinR,  {x:0, y:-SH/2}),
    ])

    const ground = Bodies.rectangle(
      pose.neck.x, matY+25, 10000, 50,
      { isStatic:true, label:'ground', friction:0.8, restitution:0.0,
        collisionFilter:{ category:0x0002, mask:0x0001 } }
    )
    World.add(this.world, ground)
  }

  update(dt) {
    if (!this.active) return
    Engine.update(this.engine, dt*1000)

    const torsoY = this.bodies?.torso?.position?.y ?? 0
    if (torsoY > this.matY - TORSO/2 - 10) {
      this.active = false
      if (this.onLand) this.onLand()
    }
  }

  getPose() {
    if (!this.active || !this.bodies) return null
    const b = this.bodies
    const ep = (body, dx, dy) => {
      const c = Math.cos(body.angle), s = Math.sin(body.angle)
      return { x: body.position.x + dx*c - dy*s, y: body.position.y + dx*s + dy*c }
    }
    return {
      head:      ep(b.torso,   0,    -TORSO/2-28),
      neck:      ep(b.torso,   0,    -TORSO/2),
      pelvis:    ep(b.torso,   0,     TORSO/2),
      lShoulder: ep(b.torso,  -SW/2, -TORSO/2+20),
      rShoulder: ep(b.torso,   SW/2, -TORSO/2+20),
      lElbow:    ep(b.uArmL,  -UA/2,  0),
      rElbow:    ep(b.uArmR,   UA/2,  0),
      lHand:     ep(b.fArmL,  -FA/2,  0),
      rHand:     ep(b.fArmR,   FA/2,  0),
      lHip:      ep(b.torso,  -HW/2,  TORSO/2),
      rHip:      ep(b.torso,   HW/2,  TORSO/2),
      lKnee:     ep(b.thighL,  0,     TH/2),
      rKnee:     ep(b.thighR,  0,     TH/2),
      lFoot:     ep(b.shinL,   0,     SH/2),
      rFoot:     ep(b.shinR,   0,     SH/2),
      lArmStretched: false, rArmStretched: false,
      lLegStretched: false, rLegStretched: false,
    }
  }

  deactivate() {
    this.active = false
    World.clear(this.world)
    Engine.clear(this.engine)
    this.bodies = null
  }
}
