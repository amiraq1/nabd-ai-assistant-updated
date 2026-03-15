import { useEffect } from 'react';
import { PageAgent } from 'page-agent';

const PageAgentIntegration = () => {
  useEffect(() => {
    // تهيئة PageAgent عند تحميل المكون
    // ملاحظة: يجب توفير apiKey و baseURL بشكل صحيح في الإنتاج
    const agent = new PageAgent({
      model: 'gpt-4o', // أو أي موديل مدعوم
      baseURL: 'https://api.openai.com/v1',
      apiKey: import.meta.env.VITE_OPENAI_API_KEY || '', 
      language: 'ar-SA'
    });

    // إظهار لوحة التحكم الخاصة بالعامل
    // agent.panel.show();

    // يمكن أيضاً تنفيذ أوامر برمجية إذا لزم الأمر
    // agent.execute('لخص الصفحة');

    return () => {
      // تنظيف إذا لزم الأمر عند إلغاء تحميل المكون
    };
  }, []);

  return null; // هذا المكون لا يحتاج لعرض أي شيء بنفسه لأنه يستخدم لوحة تحكم المكتبة
};

export default PageAgentIntegration;
