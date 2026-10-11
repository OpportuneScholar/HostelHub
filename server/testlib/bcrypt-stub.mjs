export default { hash: async (pw) => `hash(${pw})`, hashSync: (pw) => `hash(${pw})`, compare: async (pw, h) => h === `hash(${pw})` };
