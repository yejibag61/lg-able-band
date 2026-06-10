export const mockAccounts = [
  {
    role: 'USER',
    email: 'user@example.com',
    password: 'password1234',
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
    password: 'password1234',
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
