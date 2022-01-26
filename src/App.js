import React, { useRef, useState } from "react";
import DataTable from "react-data-table-component";
import * as XLSX from "xlsx";
import { Modal, Button } from "react-bootstrap";

import "bootstrap/dist/css/bootstrap.min.css";
import "./App.css";
import uploadImage from "./Uploading2.gif";
import successImage from "./success.gif";
import failedImage from "./failed.gif";

const GATEWAY_URL =
  "https://9gi3i3ola5.execute-api.us-east-2.amazonaws.com/prod";

function App() {
  const [columns, setColumns] = useState([]);
  const [data, setData] = useState([]);
  const [token, setToken] = useState("");
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [timeoutModal, setTimeoutModal] = useState(false);
  const [filename, setFilename] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const initialFormData = {
    agent_name: "",
    username: "",
    data: [],
  };

  const [formData, updateFormData] = useState(initialFormData);

  const form = useRef(null);
  const upload = useRef();
  const agent_nameRef = useRef();
  const usernameRef = useRef();
  const secretCodeRef = useRef();

  const handleReset = () => {
    form.current.reset();
  };

  const [show, setShow] = useState(false);
  const handleClose = () => setShow(false);

  //
  const handleDone = () => {
    setDone(false);
  };
  //
  const handleRetry = () => {
    setFailed(false);
  };

  // handle file upload

  const handleFileUpload = (e) => {
    let file = e.target.files[0];
    setFilename(e.target.files[0].name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      /* Parse data */
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: "binary" });
      /* Get first worksheet */
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      /* Convert array of arrays */
      const data = XLSX.utils.sheet_to_csv(ws, { header: 1 });
      processData(data);
    };
    reader.readAsBinaryString(file);
  };

  //Reset File
  const handleUploadReset = () => {
    setShow(false);
    upload.current.value = null;
  };

  // process CSV data
  const processData = (dataString) => {
    const dataStringLines = dataString.split(/\r\n|\n/);
    const headers = dataStringLines[0].split(
      /,(?![^"]*"(?:(?:[^"]*"){2})*[^"]*$)/
    );

    const list = [];
    for (let i = 1; i < dataStringLines.length; i++) {
      const row = dataStringLines[i].split(
        /,(?![^"]*"(?:(?:[^"]*"){2})*[^"]*$)/
      );
      if (headers && row.length == headers.length) {
        const obj = {};
        for (let j = 0; j < headers.length; j++) {
          let d = row[j];
          if (d.length > 0) {
            if (d[0] == '"') d = d.substring(1, d.length - 1);
            if (d[d.length - 1] == '"') d = d.substring(d.length - 2, 1);
          }
          if (headers[j]) {
            obj[headers[j]] = d;
          }
        }
        // remove the blank rows
        if (Object.values(obj).filter((x) => x).length > 0) {
          list.push(obj);
        }
      }
    }
    // prepare columns list from headers
    const columns = headers.map((c) => ({
      name: c,
      selector: c,
    }));

    setData(list);
    setShow(list.length > 1 ? true : false);
    setColumns(columns);
  };

  function parseNumber(value, pattern) {
    return value
      .trim()
      .split(pattern || /[.," "]/)
      .join("")
      .trim();
  }

  function groupByCollection(data) {
    const results = [];
    let dataTab = [...data];
    while (dataTab.length !== 0) {
      let collection = dataTab[0];
      let group = dataTab.filter(
        (item) => item[0]?.toLowerCase() === collection[0]?.toLowerCase()
      );
      results.push({
        title: collection[0]?.toLowerCase(),
        data: [...group.map((item) => item.slice(1))],
      });
      dataTab = dataTab.filter(
        (item) => item[0]?.toLowerCase() !== collection[0]?.toLowerCase()
      );
    }
    return [...results];
  }

  const handleConvertToString = () => {
    const [doc] = document.querySelector("input[type=file]").files;
    const reader = new FileReader();
    reader.onload = function (event) {
      const finalDoc = reader.result;
      const tab = finalDoc
        .split("\n")
        .slice(1, -1)
        .map((item) =>
          item
            .replace(
              /("+(\s)*\d+(,\d+){1,}(\s)*"+)/gi,
              (
                c // remove comma from number values
              ) => c.split(",").join("")
            )
            .replace(
              /("+(\s)*\w+((,|(,(\s)*)+)(\d|\w|(\w(\s)*))+){1,}(\s)*"+)/gi, // remove comma from words values
              (c) => c.split(",").join(" ")
            )
            .split(",")
            .map((item) =>
              item
                .split('"')
                .filter((item) => item !== '"')
                .map((item) => item.trim())
                .join("")
            )
        )
        .filter((item) => item.join("").trim().length !== 0);
      for (let i = 0; i < tab.length; i++) {
        tab[i][3] = parseInt(parseNumber(tab[i][3]));
        tab[i][4] = parseInt(parseNumber(tab[i][4]));
        tab[i][5] = parseFloat(parseNumber(tab[i][5], /[," "]/));
        tab[i][6] = parseFloat(parseNumber(tab[i][6], /[," "]/));
      }

      let hasError = !tab.every((item) =>
        item.slice(0, 3).every((item) => item.length !== 0)
      );

      for (let i = 0; i < tab.length; i++) {
        const item = tab[i];

        if (
          !isNaN(Number(item[0])) ||
          !isNaN(Number(item[1])) ||
          !isNaN(Number(item[2])) ||
          isNaN(item[3]) ||
          isNaN(item[4]) ||
          isNaN(item[5]) ||
          isNaN(item[6])
        ) {
          hasError = true;
          console.log(
            "hasError",
            hasError,
            item[0],
            item[1],
            item[2],
            item[3],
            item[4],
            item[5],
            item[6]
          );
          break;
        }
      }
      if (hasError) {
        alert("Import Error");
      } else {
        const formattedTab = groupByCollection(tab).map((item) => ({
          ...item,
          data: groupByCollection(item.data),
        }));
        updateFormData((prevState) => ({
          ...prevState,
          data: formattedTab,
        }));
      }
    };

    reader.readAsText(doc);

    handleClose();
  };

  const handleChange = (e) => {
    updateFormData({
      ...formData,

      [e.target.name]: e.target.value.trim(),
    });
  };

  const handleSetToken = (e) => {
    setToken(e.target.value);
  };

  const handleSubmit = async (e) => {
    console.log(token);
    e.preventDefault();
    if (
      usernameRef.current.value.length === 0 ||
      agent_nameRef.current.value.length === 0 ||
      upload.current.value.length === 0
    ) {
      alert("Every Field is Required");
    } else {
      setUploading(true);
      try {
        const response = await fetch(GATEWAY_URL, {
          method: "POST",

          mode: "cors",
          body: JSON.stringify(formData),
          headers: {
            // "Access-Control-Allow-Origin": "*",
            // "x-api-key": token,
            "Content-Type": "application/json",
          },
        });
        console.log("response here", response);
        if (response.ok) {
          console.log("response json here", response.json());
          setUploading(false);
          setDone(true);
        }
        setUploading(false);
        setDone(true);
      } catch (error) {
        console.log("fetch error here", error);
        if (error) {
          setUploading(false);
          setFailed(true);
          setErrorMessage(error);
        }
      } finally {
        console.log(formData);
        form.current.reset(); //this will reset all the inputs in the form
      }
    }
  };

  return (
    <div className="App">
      <header className="App-header">Upload Inventory File</header>
      <div className="Body">
        <form className="form" ref={form} name="submitForm" id="submitForm">
          <input
            className="input"
            type="text"
            name="agent_name"
            ref={agent_nameRef}
            placeholder="Agent Username"
            required
            onChange={handleChange}
          />
          <input
            className="input"
            type="text"
            name="username"
            ref={usernameRef}
            placeholder="KBM Username"
            required
            onChange={handleChange}
          />
          <input
            className="input"
            type="password"
            name="token"
            ref={secretCodeRef}
            placeholder="Secret API Key"
            required
            onChange={handleSetToken}
          />
          <input
            className="input"
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileUpload}
            ref={upload}
            id="fileInput"
            name="data"
            required
          />

          <div className="buttonArea">
            <Button
              className="button"
              variant="danger"
              type="reset"
              onClick={handleReset}
            >
              Reset
            </Button>
            <Button
              className="button"
              variant="success"
              type="submit"
              onClick={handleSubmit}
            >
              Upload
            </Button>
          </div>
        </form>

        <Modal show={show} onHide={handleClose}>
          <Modal.Header>
            <Modal.Title>Preview file</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <DataTable
              pagination
              highlightOnHover
              columns={columns}
              data={data}
            />
          </Modal.Body>
          <Modal.Footer>
            <div className="buttonArea">
              <Button
                variant="danger"
                className="button"
                onClick={handleUploadReset}
              >
                Cancel
              </Button>
              <Button
                variant="success"
                className="button"
                onClick={handleConvertToString}
              >
                Confirm
              </Button>
            </div>
          </Modal.Footer>
        </Modal>
        <Modal show={uploading} centered size="sm" className="uploadingModal">
          <Modal.Header>
            <Modal.Title className="modalTitle">{filename}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div className="uploading">
              <img className="image" src={uploadImage} alt="uploading...." />
            </div>
          </Modal.Body>
        </Modal>
        <Modal show={done} centered size="sm" className="uploadingModal">
          <Modal.Header>
            <Modal.Title className="modalTitle">
              Upload Successful...
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div className="uploading">
              <img className="image" src={successImage} alt="Completed.." />
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="success" className="button" onClick={handleDone}>
              Done
            </Button>
          </Modal.Footer>
        </Modal>
        <Modal show={failed} centered size="sm" className="uploadingModal">
          <Modal.Header>
            <Modal.Title className="modalTitle">{errorMessage} </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div className="uploading">
              <img className="image" src={failedImage} alt="Completed.." />
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="danger" className="button" onClick={handleRetry}>
              Retry
            </Button>
          </Modal.Footer>
        </Modal>
        <Modal
          show={timeoutModal}
          centered
          size="sm"
          className="uploadingModal"
        >
          <Modal.Header>
            <Modal.Title className="modalTitle">Request Timed Out.</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div className="timeout">
              <p>
                Your Upload Request Timed Out. This can be due to an unstable
                internet connection or high traffick on our servers. Please Wait
                and Try again after a while.
              </p>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="warning"
              className="button"
              onClick={() => {
                setTimeoutModal(false);
              }}
            >
              Retry
            </Button>
          </Modal.Footer>
        </Modal>
      </div>
    </div>
  );
}

export default App;
