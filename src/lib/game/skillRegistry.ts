import { PlayerSkill, PlayerStats, BossStats, PrimaryStats } from '@/types/game'
import { ClassBonuses, EquippedGear } from '@/types/game'
import { StatusEffect } from '@/lib/game/statusEffects'
import {
  applyBurn, applyEnemyPoison, applyPlayerBuff,
  applyEnemyDebuff, applyConfused,
} from '@/lib/game/statusEffects'
import { resolvePlayerAttack, DamageResult } from '@/lib/game/combat'

// ─── Contexto disponible para cualquier skill handler ─────────────────────────

export interface SkillContext {
  skill: PlayerSkill
  playerName: string
  playerStats: PlayerStats
  primaryStats: PrimaryStats
  gear: EquippedGear
  classBonuses: ClassBonuses
  staffAttackBonus: number
  weaponTypeDamageBonus: Partial<Record<string, number>>
  critMult?: number
  target: {
    instanceId: number
    name: string
    currentHP: number
    maxHP: number
    attack: number
    defense: number
    alive: boolean
    enemyTypes: string[]
  }
  liveEnemies: SkillContext['target'][]
  statusEffects: StatusEffect[]
  currentPlayerHP: number
  currentPlayerStamina: number
  currentPlayerMana: number
}

// ─── Resultado que un skill handler puede retornar ────────────────────────────

export interface SkillResult {
  damageResult?: DamageResult
  newTargetHP?: number
  healPlayer?: number
  newStatusEffects?: StatusEffect[]
  splashDamage?: Record<number, number>
  log: string[]
}

// ─── Helper interno: daño estándar vía resolvePlayerAttack ───────────────────

function resolveDamage(ctx: SkillContext): { damageResult: DamageResult; newTargetHP: number } {
  const targetStats: BossStats = {
    hp: ctx.target.currentHP,
    max_hp: ctx.target.maxHP,
    attack: ctx.target.attack,
    defense: ctx.target.defense,
  }
  const ismagical = ctx.skill.type === 'magical'
  const staffBonus = ismagical ? ctx.staffAttackBonus * 2 : 0
  const { damageResult, newEnemyHP } = resolvePlayerAttack(
    ctx.playerStats, ctx.primaryStats, targetStats, ctx.target.currentHP,
    ctx.gear, true, ctx.skill.damage_multiplier, ctx.skill.type,
    ctx.classBonuses, ctx.target.enemyTypes as any,
    {
      ignores_weapon: ctx.skill.ignores_weapon,
      ignores_defense: ctx.skill.ignores_defense,
      ignores_class_bonus: ctx.skill.ignores_class_bonus,
    },
    staffBonus,
    ctx.weaponTypeDamageBonus,
    ctx.critMult,
  )
  return { damageResult, newTargetHP: newEnemyHP }
}

// ─── Registry global de skills ────────────────────────────────────────────────
// Agregar una skill nueva = agregar una entrada acá + el registro en DB/BASE_SKILLS.

type SkillHandler = (ctx: SkillContext) => SkillResult

export const SKILL_REGISTRY: Record<string, SkillHandler> = {

  golpe_destellante: (ctx) => {
    const { damageResult, newTargetHP } = resolveDamage(ctx)
    const critText = damageResult.isOvercrit ? ' ⚡⚡ OVERCRIT!' : damageResult.isCritical ? ' ⚡ CRÍTICO!' : ''
    return {
      damageResult,
      newTargetHP,
      log: [`✨ ${ctx.playerName} usa ${ctx.skill.name} en ${ctx.target.name} por ${damageResult.damage} de daño!${critText}`],
    }
  },

  fireball: (ctx) => {
    const { damageResult, newTargetHP } = resolveDamage(ctx)
    const critText = damageResult.isOvercrit ? ' ⚡⚡ OVERCRIT!' : damageResult.isCritical ? ' ⚡ CRÍTICO!' : ''
    const log: string[] = [
      `✨ ${ctx.playerName} usa ${ctx.skill.name} en ${ctx.target.name} por ${damageResult.damage} de daño!${critText}`,
    ]
    let newStatusEffects = ctx.statusEffects
    if (ctx.skill.burn_chance) {
      const isCrit = damageResult.isCritical || damageResult.isOvercrit
      const burnRoll = isCrit ? 1.0 : ctx.skill.burn_chance
      if (Math.random() < burnRoll) {
        const alreadyBurning = newStatusEffects.some(e => e.type === 'burn' && e.instanceId === ctx.target.instanceId)
        newStatusEffects = applyBurn(ctx.target.instanceId, newStatusEffects)
        log.push(alreadyBurning
          ? `🔥 Las llamas en ${ctx.target.name} se intensifican!`
          : isCrit
            ? `🔥 ¡Golpe crítico! ¡${ctx.target.name} está en llamas!`
            : `🔥 ¡${ctx.target.name} está en llamas!`
        )
      }
    }
    return { damageResult, newTargetHP, newStatusEffects, log }
  },

  nube_toxica: (ctx) => {
    const log: string[] = [`✨ ${ctx.playerName} usa ${ctx.skill.name}!`]
    let newStatusEffects = ctx.statusEffects
    for (const e of ctx.liveEnemies) {
      newStatusEffects = applyEnemyPoison(e.instanceId, newStatusEffects)
      log.push(`☠️ ${e.name} fue envenenado!`)
    }
    return { newStatusEffects, log }
  },

  test_nuke: (ctx) => {
    const { damageResult, newTargetHP } = resolveDamage(ctx)
    const log: string[] = [
      `💥 ${ctx.playerName} usa ${ctx.skill.name} en ${ctx.target.name} por ${damageResult.damage} de daño!`,
    ]
    const splashDamage: Record<number, number> = {}
    if (ctx.skill.splash_multiplier) {
      const splashBase = Math.round(damageResult.damage * ctx.skill.splash_multiplier)
      for (const adj of ctx.liveEnemies.filter(e => e.instanceId !== ctx.target.instanceId)) {
        splashDamage[adj.instanceId] = Math.max(1, splashBase)
        log.push(`💥 Daño en área a ${adj.name} por ${splashDamage[adj.instanceId]}!`)
      }
    }
    return { damageResult, newTargetHP, splashDamage, log }
  },

  cura_sagrada: (ctx) => {
    const healAmount = Math.round(ctx.playerStats.max_hp * (ctx.skill.heal_player_pct ?? 0.3))
    const actualHeal = Math.min(healAmount, ctx.playerStats.max_hp - ctx.currentPlayerHP)
    return {
      healPlayer: actualHeal,
      log: [`✨ ${ctx.playerName} usa ${ctx.skill.name}! +${actualHeal} HP restaurado.`],
    }
  },

  grito_de_guerra: (ctx) => {
    const buff = ctx.skill.apply_player_buff ?? { stat: 'attack', multiplier: 1.2, turns: 3 }
    const newStatusEffects = applyPlayerBuff(buff.stat as any, buff.multiplier, ctx.statusEffects, buff.turns)
    return {
      newStatusEffects,
      log: [`⚔️ ${ctx.playerName} lanza un grito de guerra! Ataque aumentado por ${buff.turns} turnos.`],
    }
  },

  debilitar: (ctx) => {
    const debuff = ctx.skill.apply_enemy_debuff ?? { stat: 'attack', multiplier: 0.9, turns: 3 }
    const newStatusEffects = applyEnemyDebuff(ctx.target.instanceId, debuff.stat as any, debuff.multiplier, ctx.statusEffects, debuff.turns)
    return {
      newStatusEffects,
      log: [`🌀 ${ctx.playerName} debilita a ${ctx.target.name}! Su ataque se reduce por ${debuff.turns} turnos.`],
    }
  },

  engano: (ctx) => {
    const status = ctx.skill.apply_enemy_status ?? { type: 'confused', turns: 3, value: 0.10 }
    const newStatusEffects = applyConfused(ctx.target.instanceId, ctx.statusEffects, status.value ?? 0.10, status.turns)
    return {
      newStatusEffects,
      log: [`🎭 ${ctx.playerName} engaña a ${ctx.target.name}! Tiene ${((status.value ?? 0.10) * 100).toFixed(0)}% de errar sus ataques por ${status.turns} turnos.`],
    }
  },

}

// ─── Fallback genérico para skills con solo daño y flags simples ──────────────
// Cubre cualquier skill futura que no tenga handler propio pero sí damage_multiplier.

function genericDamageHandler(ctx: SkillContext): SkillResult {
  const log: string[] = []
  let newStatusEffects = ctx.statusEffects
  let splashDamage: Record<number, number> = {}
  let damageResult: DamageResult | undefined
  let newTargetHP: number | undefined

  if ((ctx.skill.damage_multiplier ?? 0) > 0) {
    const resolved = resolveDamage(ctx)
    damageResult = resolved.damageResult
    newTargetHP = resolved.newTargetHP
    const critText = damageResult.isOvercrit ? ' ⚡⚡ OVERCRIT!' : damageResult.isCritical ? ' ⚡ CRÍTICO!' : ''
    log.push(`✨ ${ctx.playerName} usa ${ctx.skill.name} en ${ctx.target.name} por ${damageResult.damage} de daño!${critText}`)

    if (ctx.skill.splash_multiplier) {
      const splashBase = Math.round(damageResult.damage * ctx.skill.splash_multiplier)
      for (const adj of ctx.liveEnemies.filter(e => e.instanceId !== ctx.target.instanceId)) {
        splashDamage[adj.instanceId] = Math.max(1, splashBase)
        log.push(`💥 Daño en área a ${adj.name} por ${splashDamage[adj.instanceId]}!`)
      }
    }

    if (ctx.skill.burn_chance) {
      const isCrit = damageResult.isCritical || damageResult.isOvercrit
      if (Math.random() < (isCrit ? 1.0 : ctx.skill.burn_chance)) {
        const alreadyBurning = newStatusEffects.some(e => e.type === 'burn' && e.instanceId === ctx.target.instanceId)
        newStatusEffects = applyBurn(ctx.target.instanceId, newStatusEffects)
        log.push(alreadyBurning ? `🔥 Las llamas en ${ctx.target.name} se intensifican!` : `🔥 ¡${ctx.target.name} está en llamas!`)
      }
    }
  } else {
    log.push(`✨ ${ctx.playerName} usa ${ctx.skill.name}!`)
  }

  if (ctx.skill.poison_all) {
    for (const e of ctx.liveEnemies) {
      newStatusEffects = applyEnemyPoison(e.instanceId, newStatusEffects)
      log.push(`☠️ ${e.name} fue envenenado!`)
    }
  }

  return { damageResult, newTargetHP, newStatusEffects, splashDamage, log }
}

export function resolveSkill(ctx: SkillContext): SkillResult {
  const handler = SKILL_REGISTRY[ctx.skill.id] ?? genericDamageHandler
  return handler(ctx)
}