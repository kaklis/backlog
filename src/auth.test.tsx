import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { LockGate } from './components/LockGate'
import { hasPasscode, removePasscode, setPasscode, verifyPasscode } from './auth'

afterEach(() => sessionStorage.clear())

describe('auth', () => {
  it('stores only a hash and verifies the passcode', async () => {
    await setPasscode('hunter22')
    expect(hasPasscode()).toBe(true)
    expect(localStorage.getItem('backlog.auth')).not.toContain('hunter22')
    expect(await verifyPasscode('hunter22')).toBe(true)
    expect(await verifyPasscode('wrong')).toBe(false)
    removePasscode()
    expect(hasPasscode()).toBe(false)
  })
})

describe('LockGate', () => {
  const setup = () => ({ user: userEvent.setup(), ...render(<LockGate><App /></LockGate>) })

  it('shows the board straight away when no passcode is set', () => {
    setup()
    expect(screen.queryByText('Backlog is locked')).not.toBeInTheDocument()
  })

  it('blocks the board until the right passcode is entered', async () => {
    await setPasscode('hunter22')
    const { user } = setup()
    expect(screen.getByText('Backlog is locked')).toBeInTheDocument()
    expect(screen.queryByRole('region')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Passcode'), 'nope{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect passcode')

    await user.type(screen.getByLabelText('Passcode'), 'hunter22{Enter}')
    expect(await screen.findByText('Lock')).toBeInTheDocument()
    expect(screen.queryByText('Backlog is locked')).not.toBeInTheDocument()
  })

  it('sets a passcode from the menu, then locks', async () => {
    const { user } = setup()
    await user.click(screen.getByText('Lock'))
    await user.click(screen.getByRole('button', { name: 'Set passcode' }))
    await user.type(screen.getByLabelText('New passcode'), 'abcd')
    await user.type(screen.getByLabelText('Confirm passcode'), 'abcd')
    await user.click(screen.getByRole('button', { name: 'Save passcode' }))
    await user.click(screen.getByText('Lock'))
    await user.click(await screen.findByRole('button', { name: /Lock now/ }))
    expect(screen.getByText('Backlog is locked')).toBeInTheDocument()
  })
})
