import _ from 'lodash'
import { CQAt, CQImage } from 'cq-websocket'
import { choice } from '@qqbot/utils'
/* global QQ */

const templace = (tmpl) =>
  tmpl.reduce((prev, words) =>
    _.flatten(prev.map(p =>
      words.map(w => p + w)
    )), [''])

export default class RussianRoulette {
  Name    = "俄罗斯轮盘"
  Aliases = []

  JoinSeconds = 60
  FireSeconds = 30
  DeadMinutes = 10
  JoinMessages = ["加入", "参加", "join", "j"]
  FireMessages = ["开火", "开枪", "fire", "f"]

  FireDieMessages = [
    ...templace([
      [ "{at}" ],
      [ "颤颤巍巍", "毫不犹豫", "一脸懵逼", "生无可恋" ],
      [ "地扣动了扳机，" ],
      [ "然而——好运没有降临" ],
    ]),
    ...templace([
      [ "砰！一声枪声响起，", "枪口冒出火舌，" ],
      [ "{at}" ],
      [ "倒在了血泊中", "倒在了赌桌上", "倒在了吃瓜群众的怀中", "迈向了二次元的入口", "的身上绽放出了生命之花" ],
    ]),
  ]
  FireSafeMessages = [
    ...templace([
      [ "{at}" ],
      [ "颤颤巍巍", "毫不犹豫", "一脸懵逼", "生无可恋" ],
      [ "地扣动了扳机，" ],
      [ "然而——什么都没有发生", "围观群众发出了失望的叹息" ],
    ]),
  ]
  FullBulletImages = [
    'https://raw.githubusercontent.com/yukixz/qqbot/master/game/img/3e20b9592e5f6409e3e57b366a252ec7.jpg',
    'https://raw.githubusercontent.com/yukixz/qqbot/master/game/img/5c3972ef4b5fc782d40e53a1f7a8080e.jpg',
  ]

  constructor() {
    this.inGame = false
    this.status = "Idle"  // Idle, Ready, Gaming
    this.msgs = []
  }
  setQQBan = async (user, minutes) => {
    if (! await QQ.isGroupAdmin(this.group, user)) {
      await QQ('set_group_ban', {
        group_id: this.group,
        user_id : user,
        duration: minutes * 60,
      })
    }
  }
  sendQQMsg = async (extra) => {
    if (extra != null) {
      this.msgs.push(extra)
    }
    if (this.msgs.length > 0) {
      const msgs = this.msgs.filter(s => s != null)
      await QQ('send_group_msg', {
        group_id: this.group,
        message : msgs.join('\n'),
      })
    }
    this.msgs = []
  }
  handleGroupMsg = async (ctx, tags) => {
    const { user_id: user, message } = ctx
    if (this.status === "Ready") {
      if (this.JoinMessages.includes(message)) {
        await this.join(user)
        return
      }
    }
    if (this.status === "Gaming") {
      if (this.JoinMessages.includes(message)) {
        await this.sendQQMsg(`${new CQAt(user)} 赌局已经开始，无法加入。`)
        return
      }
      if (this.FireMessages.includes(message)) {
        await this.firePlayer(user)
        return
      }
    }
  }
  open = async (g) => {
    this.inGame = true
    this.status = "Ready"
    this.g       = g
    this.group   = g.Group
    this.players = []
    await this.sendQQMsg([
      `生死有命，富贵在天！`,
      `俄罗斯轮盘将在 ${this.JoinSeconds} 秒后开始。`,
      `参加：${this.JoinMessages.join('/')}`,
      `开枪：${this.FireMessages.join('/')}`,
    ].join('\n'))
    this.tid = setTimeout(this.start, this.JoinSeconds * 1000)
  }
  cancel = async () => {
    this.inGame = false
    this.status = "Idle"
    await this.sendQQMsg(`${this.Name}已取消`)
  }
  join = async (user) => {
    const player = this.players.find(p => p.qq === user)
    if (player == null) {
      await this.sendQQMsg(`${new CQAt(user)} 坐上了赌桌。`)
      this.players.push({
        qq: user,
        isAlive: true,
      })
    }
  }
  start = async () => {
    clearTimeout(this.tid)
    if (this.players.length < 2) {
      this.inGame = false
      this.status = "Idle"
      await this.sendQQMsg(`参加人数不足，${this.Name}已取消。`)
    } else {
      this.status = "Gaming"
      this.players = _.shuffle(this.players)
      this.revolver = []
      this.msgs.push("赌局开始！")
      await this.next(true)
    }
  }
  end = async () => {
    this.inGame = false
    this.status = "Idle"
    const alives = this.players.filter(p => p.isAlive)
    this.msgs.push(`赌局结束！幸存者：${alives.length > 0 ? alives.map(p => new CQAt(p.qq)) : '无'}`)
    await this.sendQQMsg()
  }
  reload = async () => {
    if (this.revolver.length === 0) {
      const slot   = 6
      const bullet = choice([2, 2, 3, 3, 4, 4, 5, 6])
      this.revolver = _.shuffle(Array(slot).fill(false).fill(true, 0, bullet))
      this.msgs.push(`弹匣为空，重新上膛（${bullet}/${slot}）`)
      if (bullet === slot)
        this.msgs.push(new CQImage(choice(this.FullBulletImages)))
    }
  }
  next = async (isStart=false) => {
    let next = -1
    if (isStart) {
      next = 0
    } else {
      const aliveNum = this.players.reduce((c, p) => c + (p.isAlive ? 1 : 0), 0)
      if (aliveNum >= 2) {
        for (let i = this.curr + 1; i < this.players.length; i++)
          if (next < 0 && this.players[i].isAlive)
            next = i
        for (let i = 0; i < this.curr; i++)
          if (next < 0 && this.players[i].isAlive)
            next = i
      }
    }
    if (next >= 0) {
      this.curr = next
      await this.reload()
      await this.fire0()
    } else {
      await this.end()
    }
  }
  fire0 = async () => {
    const player = this.players[this.curr]
    this.msgs.push(`下一个：${new CQAt(player.qq)}，请开枪`)
    await this.sendQQMsg()
    this.tid = setTimeout(this.force, this.FireSeconds * 1000)
  }
  firePlayer = async (user) => {
    const player = this.players[this.curr]
    if (player.qq !== user)
      return

    clearTimeout(this.tid)
    if (this.revolver.pop()) {
      player.isAlive = false
      await this.setQQBan(player.qq, this.DeadMinutes)
      this.msgs.push(choice(this.FireDieMessages).replace('{at}', new CQAt(player.qq)))
    } else {
      this.msgs.push(choice(this.FireSafeMessages).replace('{at}', new CQAt(player.qq)))
    }

    await this.next()
  }
  force = async () => {
    clearTimeout(this.tid)
    const player = this.players[this.curr]

    this.revolver.pop()  // Assume shoot
    player.isAlive = false
    await this.setQQBan(player.qq, this.DeadMinutes)
    this.msgs.push(`${new CQAt(player.qq)}犹豫不决，吃瓜群众一枪崩了他的狗命。`)

    await this.next()
  }
}