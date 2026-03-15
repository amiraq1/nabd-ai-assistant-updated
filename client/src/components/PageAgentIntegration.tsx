import { useEffect } from 'react';
import { PageAgent } from 'page-agent';

const PageAgentIntegration = () => {
  useEffect(() => {
    // تهيئة PageAgent باستخدام Nvidia API
    // ملاحظة: تأكد من تعيين VITE_NVIDIA_API_KEY في ملف .env الخاص بك
    const agent = new PageAgent({
      model: 'meta/llama-3.1-405b-instruct', // يمكنك تغيير الموديل حسب المتاح في Nvidia NIM
      baseURL: 'https://integrate.api.nvidia.com/v1',
      apiKey: import.meta.env.VITE_NVIDIA_API_KEY || '', 
      language: 'ar-SA'
    });

    // إظهار لوحة التحكم الخاصة بالعامل تلقائياً
    agent.panel.show();

    return () => {
      // تنظيف إذا لزم الأمر
    };
  }, []);

  return null;
};

export default PageAgentIntegration;
