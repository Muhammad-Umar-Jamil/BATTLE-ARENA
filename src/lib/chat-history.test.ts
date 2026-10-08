import { describe, expect, it } from 'vitest'
import { groupArchivedChats, type ArchivedChatMessage } from './chat-history'

const message = (id: string, username: string, level_id: number, created_at: string, role: 'user' | 'assistant' = 'user'): ArchivedChatMessage => ({
  id, username, level_id, role, content: `${username}-${level_id}-${id}`, created_at, deleted_at: created_at,
})

describe('archived chat grouping', () => {
  it('groups teams and levels without mixing messages', () => {
    const grouped = groupArchivedChats([
      message('a', 'Alpha', 1, '2026-10-09T10:00:00Z'), message('b', 'Alpha', 2, '2026-10-09T11:00:00Z'), message('c', 'Beta', 1, '2026-10-09T12:00:00Z'),
    ])
    expect(grouped.map((team) => team.username)).toEqual(['Beta', 'Alpha'])
    expect(grouped[1].levels.map((level) => level.levelId)).toEqual([2, 1])
    expect(grouped[0].levels[0].messages.map((row) => row.username)).toEqual(['Beta'])
  })

  it('counts teams and levels and orders messages oldest first', () => {
    const grouped = groupArchivedChats([
      message('old', 'Alpha', 1, '2026-10-09T09:00:00Z'), message('new', 'Alpha', 1, '2026-10-09T13:00:00Z'), message('mid', 'Alpha', 1, '2026-10-09T11:00:00Z'),
    ])
    expect(grouped[0].messageCount).toBe(3)
    expect(grouped[0].levels[0].messageCount).toBe(3)
    expect(grouped[0].levels[0].messages.map((row) => row.id)).toEqual(['old', 'mid', 'new'])
  })

  it('returns an empty list for empty history', () => {
    expect(groupArchivedChats([])).toEqual([])
  })
})
