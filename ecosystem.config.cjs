module.exports = {
  apps: [
    {
      name: 'ratio-double-calendar-daemon',
      script: './dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      cron_restart: '20 8 * * *',
      max_memory_restart: '512M',
      autorestart: true,
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
