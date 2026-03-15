import { useEffect } from 'react';
import { PageAgent } from 'page-agent';

const PageAgentIntegration = () => {
  useEffect(() => {
    // تهيئة PageAgent باستخدام Nvidia API والمفتاح المباشر
    const agent = new PageAgent({
      model: 'meta/llama-3.1-405b-instruct', 
      baseURL: 'https://integrate.api.nvidia.com/v1',
      apiKey: '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', 
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
