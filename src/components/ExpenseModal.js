import React, { useState } from 'react';
import { Button, Modal, Form, Input, InputNumber, Select, Upload, message } from 'antd';
import { EuroOutlined, CameraOutlined, SaveOutlined } from '@ant-design/icons';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';

const { Option } = Select;

const ExpenseModal = ({ user, employeeData }) => {
  const [visible, setVisible] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileList, setFileList] = useState([]);
  const [form] = Form.useForm();

  // Recupera il nome corretto (dati dipendente > dati utente > generico)
  const employeeName = employeeData 
    ? `${employeeData.name} ${employeeData.surname}` 
    : (user?.displayName || "Dipendente");

  const handleSave = async (values) => {
      if (!user?.uid) {
          message.error("Errore utente non identificato.");
          return;
      }
      
      setUploading(true);
      try {
          let photoUrl = "";
          // Carica Foto su Firebase Storage
          if (fileList.length > 0 && storage) {
              const file = fileList[0].originFileObj;
              // Percorso: receipts / UID_Dipendente / Timestamp_NomeFile
              const storageRef = ref(storage, `receipts/${user.uid}/${Date.now()}_${file.name}`);
              const snapshot = await uploadBytes(storageRef, file);
              photoUrl = await getDownloadURL(snapshot.ref);
          }

          // Salva su Firestore
          await addDoc(collection(db, "employee_expenses"), {
              userId: user.uid,
              employeeName: employeeName,
              date: Timestamp.now(),
              type: values.type,
              amount: parseFloat(values.amount),
              description: values.description || "",
              photoUrl: photoUrl,
              status: 'pending', // In attesa di rimborso
              createdAt: Timestamp.now()
          });

          message.success("Spesa registrata con successo!");
          setVisible(false);
          form.resetFields();
          setFileList([]);
      } catch (error) {
          console.error(error);
          message.error("Errore salvataggio. Riprova.");
      }
      setUploading(false);
  };

  return (
    <>
      <Button 
        type="primary" 
        size="large"
        icon={<EuroOutlined />} 
        onClick={() => setVisible(true)}
        style={{ 
            width: '100%', 
            height: '50px', 
            fontSize: '16px', 
            fontWeight: 'bold',
            backgroundColor: '#fa8c16', // Arancione
            borderColor: '#fa8c16',
            marginTop: '15px'
        }}
      >
        REGISTRA SPESA
      </Button>

      <Modal
        title="🧾 Nuova Spesa / Rimborso"
        open={visible}
        onCancel={() => setVisible(false)}
        footer={null}
        destroyOnClose
        centered
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
           <Form.Item name="type" label="Tipo di Spesa" rules={[{ required: true, message: 'Seleziona un tipo' }]}>
              <Select placeholder="Seleziona...">
                  <Option value="Carburante">⛽ Carburante</Option>
                  <Option value="Pasto">🍽️ Pranzo/Cena</Option>
                  <Option value="Materiale">🛠️ Materiale Urgente</Option>
                  <Option value="Parcheggio">🅿️ Parcheggio/Pedaggio</Option>
                  <Option value="Altro">Altro</Option>
              </Select>
           </Form.Item>

           <Form.Item name="amount" label="Importo (€)" rules={[{ required: true, message: 'Inserisci importo' }]}>
              <InputNumber style={{ width: '100%' }} precision={2} prefix="€" placeholder="0.00" size="large" />
           </Form.Item>

           <Form.Item name="description" label="Descrizione (es. targa furgone)">
              <Input placeholder="Es. Benzina Fiat Ducato..." />
           </Form.Item>

           <Form.Item label="Foto Scontrino">
              <Upload 
                listType="picture" 
                maxCount={1}
                fileList={fileList}
                beforeUpload={() => false} // Blocco upload automatico
                onChange={({ fileList }) => setFileList(fileList)}
                accept="image/*"
              >
                  <Button icon={<CameraOutlined />}>Scatta Foto</Button>
              </Upload>
           </Form.Item>

           <Button type="primary" htmlType="submit" block size="large" icon={<SaveOutlined />} loading={uploading}>
               INVIA RICHIESTA
           </Button>
        </Form>
      </Modal>
    </>
  );
};

export default ExpenseModal;