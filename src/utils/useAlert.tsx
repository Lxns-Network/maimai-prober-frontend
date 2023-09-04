import { useState } from 'react';

function useAlert() {
  const [isAlertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertContent, setAlertContent] = useState('');

  const openAlert = (title: string, content: string) => {
    setAlertTitle(title);
    setAlertContent(content);
    setAlertVisible(true);
  };

  const closeAlert = () => {
    setAlertVisible(false);
  };

  return {
    isAlertVisible,
    alertTitle,
    alertContent,
    openAlert,
    closeAlert,
  };
}

export default useAlert;