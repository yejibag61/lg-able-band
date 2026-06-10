export const mockAccounts = [
  {
    role: 'USER',
    email: 'user@example.com',
    passwordHash: createMockPasswordHash('password1234'),
    response: {
      accessToken: 'mock-user-token',
      role: 'USER',
      account: {
        accountId: 1,
        name: '홍길동',
        email: 'user@example.com',
      },
      userProfile: {
        userId: 1,
        name: '홍길동',
        accessibilityType: 'VISUAL',
      },
    },
  },
  {
    role: 'GUARDIAN',
    email: 'guardian@example.com',
    passwordHash: createMockPasswordHash('password1234'),
    response: {
      accessToken: 'mock-guardian-token',
      role: 'GUARDIAN',
      account: {
        accountId: 2,
        name: '보호자',
        email: 'guardian@example.com',
      },
      guardianProfile: {
        guardianId: 1,
        linkedUserId: 1,
        relationship: 'FAMILY',
      },
    },
  },
]

export function createMockPasswordHash(password) {
  let hash = 0
  for (const character of password) {
    hash = (hash << 5) - hash + character.charCodeAt(0)
    hash |= 0
  }
  return `mock-hash-${Math.abs(hash)}`
}

export function createMockSignupResponse(payload) {
  const accountId = mockAccounts.length + 1
  const baseAccount = {
    accountId,
    name: payload.name,
    email: payload.email,
  }

  if (payload.role === 'GUARDIAN') {
    return {
      accountId,
      role: 'GUARDIAN',
      guardianId: accountId,
      ...baseAccount,
      phone: payload.phone,
      relationship: payload.relationship,
    }
  }

  return {
    accountId,
    role: 'USER',
    userId: accountId,
    ...baseAccount,
    accessibilityType: payload.accessibilityType,
    notificationPrefs: payload.notificationPrefs,
  }
}

export function createMockLoginResponse(signupResponse) {
  const account = {
    accountId: signupResponse.accountId,
    name: signupResponse.name,
    email: signupResponse.email,
  }

  if (signupResponse.role === 'GUARDIAN') {
    return {
      accessToken: `mock-guardian-token-${signupResponse.accountId}`,
      role: 'GUARDIAN',
      account,
      guardianProfile: {
        guardianId: signupResponse.guardianId,
        linkedUserId: null,
        relationship: signupResponse.relationship,
      },
    }
  }

  return {
    accessToken: `mock-user-token-${signupResponse.accountId}`,
    role: 'USER',
    account,
    userProfile: {
      userId: signupResponse.userId,
      name: signupResponse.name,
      accessibilityType: signupResponse.accessibilityType,
    },
  }
}
