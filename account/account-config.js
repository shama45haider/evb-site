// Public values only. The anon key is meant to ship to browsers: it can do
// nothing but call the member_* functions (panel migration 0069) as the
// signed-in member. Never put the service role key here.
window.EVB_ACCOUNT_CONFIG = {
  supabaseUrl: 'https://bkiqjirxxodekhnzzlfw.supabase.co',
  panelUrl: 'https://panel.eastvillagebuyers.com',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJraXFqaXJ4eG9kZWtobnp6bGZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2Mjc0NzMsImV4cCI6MjEwMDIwMzQ3M30.XdjdkD7pkSR68cwKP8CGDoczKT7hM3MkAzJLMdrNmT0'
};
