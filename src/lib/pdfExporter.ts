import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

export const exportComponentToPDF = async (elementId: string, filename: string = "export.pdf") => {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`Element with id ${elementId} not found.`);
    return;
  }

  // Ensure high-quality rendering
  const canvas = await html2canvas(element, {
    scale: 2, 
    useCORS: true,
    backgroundColor: '#0a0a0a', // Match theme background
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF('p', 'mm', 'a4');
  const imgProps = pdf.getImageProperties(imgData);
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

  pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
  pdf.save(filename);
};
