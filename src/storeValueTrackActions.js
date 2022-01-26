import { DataStore, I18n, Predicates, Auth } from "aws-amplify";
import {
  Article,
  Collection,
  StoreValueTrack,
  ValidationStatus,
} from "../../models";
import testData from "../../assets/data";
import {
  StorageAccessFramework,
  readAsStringAsync,
  writeAsStringAsync,
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
} from "expo-file-system";
import * as Sharing from "expo-sharing";

import { Alert, Platform } from "react-native";
import Toast from "react-native-simple-toast";
import { createCollection } from "../collection/collectionActions";
import { createSubCollection } from "../subCollection/subCollectionActions";
import { createArticle } from "../article/articleActions";
import { timestampWithoutHour } from "../../utils/dateUtils";
import {
  setLoadCSVLastArticle,
  setImportLog,
} from "../loadImport/loadImportActions";
import shortid from "shortid";
import { checkIfCanAccessFeature } from "../../utils/generalUtils";
import AppContants from "../../assets/data";
import SimpleToast from "react-native-simple-toast";
import NetInfo from "@react-native-community/netinfo";
import { capitalizeFirstLetter } from "../../utils";
import uiTypes from "../ui/uiTypes";

const { KEY_VALUE_MONTH, MONTHS, COLORS } = testData;

const API_GATEWAY_URL =
  "https://9pk25902x9.execute-api.us-east-2.amazonaws.com/prod/api";

const createStoreValueTrack =
  (year, value = 0) =>
  async (dispatch, getState) => {
    try {
      console.log("inside store value track");
      const storeValueTrack = await DataStore.query(StoreValueTrack, (track) =>
        track.year("eq", year)
      );
      const current_mth = new Date().getMonth();
      if (!storeValueTrack.length) {
        const data = [
          ...KEY_VALUE_MONTH.slice(0, current_mth),
          { x: MONTHS[current_mth], value },
          ...KEY_VALUE_MONTH.slice(current_mth + 1),
        ];

        console.log("before creation");
        const newStoreValueTrack = await DataStore.save(
          new StoreValueTrack({
            year,
            data: JSON.stringify(
              data.reduce(
                (prev, curr, index) => ({ ...prev, [index]: curr }),
                {}
              )
            ),
            belongTo: getState().user.attributes["custom:managerName"],
          })
        );

        dispatch({
          type: "CREATE STORE VALUE TRACK",
          payload: [newStoreValueTrack],
        });
      }
    } catch (error) {
      console.error("store value track creation", error);
    }
  };

// list all stored value
const getStoreValueTrack = () => async (dispatch) => {
  try {
    const data = await DataStore.query(StoreValueTrack, Predicates.ALL);
    console.log("inside get store value track");

    const newData = data.map((item) => ({
      ...item,
      data: Object.values(item.data),
    }));
    dispatch({ type: "CREATE STORE VALUE TRACK", payload: newData });
  } catch (error) {
    console.error("store value track error", error);
  }
};

// compute store value
const computeCurrentStoreValue =
  (value, shouldComputeAll = false) =>
  async (dispatch) => {
    try {
      console.log("inside compute store value");
      const date = new Date();
      const year = date.getFullYear().toString();
      const current = await DataStore.query(StoreValueTrack, (store) =>
        store.year("eq", year)
      );
      if (current.length) {
        const currentYearStoreValue = current[0];

        await DataStore.save(
          StoreValueTrack.copyOf(currentYearStoreValue, (updated) => {
            const currentData = Object.values(updated.data);

            const mth = date.getMonth();

            const newData = [
              ...currentData.slice(0, mth),
              {
                x: MONTHS[mth],
                value: shouldComputeAll
                  ? value
                  : currentData[mth].value + value,
              },
              ...currentData.slice(mth + 1, 12),
            ];
            updated.data = JSON.stringify(
              newData.reduce(
                (prev, curr, index) => ({ ...prev, [index]: curr }),
                {}
              )
            );
          })
        );
      } else {
        dispatch(createStoreValueTrack(year, value));
      }
    } catch (error) {
      console.log("compute store value error", error);
    }
  };

const exportToCsv = (fileURI) => async (dispatch, getState) => {
  const { isTrials, activeFeatures } = getState().subscription;
  if (
    !checkIfCanAccessFeature(
      isTrials,
      AppContants.appFeatures.docSaving,
      activeFeatures
    )
  ) {
    SimpleToast.show(I18n.get("upgrate_plan"));
    return;
  }

  const HEADER_STRING = `${I18n.get("collections")}, ${I18n.get(
    "sub_collections"
  )}, ${I18n.get("items")}, ${I18n.get("b_price")}, ${I18n.get(
    "s_price"
  )}, ${I18n.get("quantity")}, ${I18n.get("alert_qty")}, sku, ${I18n.get(
    "size"
  )}, ${I18n.get("color")}, options, ${I18n.get(
    "tax"
  )}, description, ${I18n.get("comment")}\n`;
  try {
    const results = await DataStore.query(Collection, (collection) =>
      collection.isDeleted("eq", false)
    );
    const allArticles = await DataStore.query(Article, (article) =>
      article.isDeleted("eq", false).belongToStock("eq", true)
    );
    const articles = allArticles.map((article) => ({
      ...article,
      color: article.color,
    }));
    const collections = results.filter(
      (collection) => collection.type === "collection"
    );
    collections.sort((a, b) => {
      if (b.name > a.name) {
        return 1;
      }
      return -1;
    });
    const subCollections = results.filter(
      (subCollection) => subCollection.type === "subCollection"
    );

    subCollections.sort((a, b) => {
      if (b.name > a.name) {
        return 1;
      }
      return -1;
    });

    const matrix = [];

    collections.forEach((collection) => {
      const subColls = subCollections.filter(
        (subCollection) => subCollection.parentCollectionID === collection.id
      );
      subColls.forEach((subCollection) => {
        const subCollArticles = articles.filter(
          (article) => article.collectionID === subCollection.id
        );
        subCollArticles.forEach((article) => {
          const row = [];
          let description = article.description.text;
          if (description?.includes("\n")) {
            description = description.slice(0, -1);
          }
          const options = article.options.map(
            (item) => `${item.title}:${item.value}`
          );
          const tax = article.tax.map((item) => `${item.title}:${item.value}`);
          row.push(
            collection.name,
            subCollection.name,
            article.name,
            article.priceIn,
            article.priceOut,
            article.currentQty,
            article.alertQty,
            article.sku,
            article.size,
            article.color?.key,
            options.join(";"),
            tax.join(";"),
            description,
            // fromDateToString(Number(article.createdAt)),
            article.note
          );
          matrix.push([...row]);
        });
      });
    });

    const rowString = matrix.map((row) => `${row.join(",")}\n`).join("");
    const csvString = HEADER_STRING + rowString;
    if (Platform.OS == "ios") {
      await writeAsStringAsync(fileURI, csvString);
      // dispatch({ type: uiTypes.EXPORT_LOADER, payload: false });
      await Sharing.shareAsync(fileURI);
    } else {
      await StorageAccessFramework.writeAsStringAsync(fileURI, csvString);
      // dispatch({ type: uiTypes.EXPORT_LOADER, payload: false });
      Toast.show(I18n.get("export_success"));
    }
  } catch (error) {
    // dispatch({ type: uiTypes.EXPORT_LOADER, payload: false });
    console.error("export data error", error);
    Toast.show(I18n.get("export_error"));
  }
};

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

function parseNumber(value, pattern) {
  return value
    .trim()
    .split(pattern || /[.," "]/)
    .join("")
    .trim();
}

const fromCsvToInventory = (uri) => async (dispatch, getState) => {
  try {
    const str = await readAsStringAsync(uri);

    console.log("regex here########");
    const tab = str
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

    console.log("regex here########");

    let hasError = !tab.every((item) =>
      item.slice(0, 3).every((item) => item.length !== 0)
    );

    console.log("hasError", hasError);

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
      alert(I18n.get("import_error"));
    } else {
      NetInfo.fetch().then(async (state) => {
        if (state.isInternetReachable) {
          const enterpriseID = getState().enterprise.id;
          if (!enterpriseID) {
            SimpleToast.show(capitalizeFirstLetter(I18n.get("sync_progress")));
            return;
          }

          // save imported file locally
          const dirInfo = await getInfoAsync(documentDirectory + "import");
          if (!dirInfo.exists || !dirInfo.isDirectory) {
            await makeDirectoryAsync(documentDirectory + "import");
          }

          const fileID = shortid.generate();
          await writeAsStringAsync(
            documentDirectory + "import/inventory" + fileID,
            str
          );

          const itemsValue = tab.reduce(
            (prev, curr) => prev + Number(curr[5]) * Number(curr[3]),
            0
          );

          const itemsQuantity = tab.reduce(
            (prev, curr) => prev + Number(curr[5]),
            0
          );

          console.log("store value & quantity", itemsValue, itemsQuantity);

          const formattedTab = groupByCollection(tab).map((item) => ({
            ...item,
            data: groupByCollection(item.data),
          }));

          const token = `${(await Auth.currentSession())
            .getAccessToken()
            .getJwtToken()}`;

          const belongTo = getState().user.attributes["custom:managerName"];
          const username = getState().user.username;
          const accounting = Object.values(getState().accounting).filter(
            (item) => item.isMain
          );

          // const year = new Date().getFullYear().toString();
          // const current = await DataStore.query(StoreValueTrack, (store) =>
          //   store.year("eq", year)
          // );

          const data_to_send = {
            data: formattedTab,
            belongTo,
            username,
            enterpriseID,
            accountingID: accounting[0].id,
            labelOperation: I18n.get("purchase"),
            storeValue: {
              // storeValueID: current[0].id,
              itemsValue,
              itemsQuantity,
            },
          };

          console.log("____________________________________", data_to_send);
          dispatch({ type: uiTypes.UPLOAD_FILE_STATUS, payload: true });
          const res = await fetch(API_GATEWAY_URL, {
            method: "post",
            headers: {
              Authorization: token,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(data_to_send),
          });
          const data = await res.json();

          console.log("____________________________________###", data);

          // batch(() => {
          //   dispatch(setLoadCSVLastArticle(tab.length));
          //   dispatch(
          //     setImportLog({ type: "LOADING_FILE", msg: "loading file..." })
          //   );
          //   dispatch(putAllInStock(formattedTab));
          //   dispatch(computeCurrentStoreValue(itemsValue));
          // });
          if (data.status === "success") {
            SimpleToast.show(capitalizeFirstLetter(I18n.get("op_succeeded")));
          } else if (data.status === "failed") {
            SimpleToast.show(capitalizeFirstLetter(I18n.get("op_failed")));
          }
          dispatch({ type: uiTypes.UPLOAD_FILE_STATUS, payload: false });
        } else {
          Alert.alert(
            capitalizeFirstLetter(I18n.get("network_error")),
            capitalizeFirstLetter(I18n.get("check_internet_connection")),
            [
              {
                text: "ok",
              },
            ]
          );
        }
      });
    }
  } catch (error) {
    console.log("import data error", error);
  } finally {
    dispatch({ type: uiTypes.UPLOAD_FILE_STATUS, payload: false });
  }
};

const putOneInStock = (element) => async (dispatch, getState) => {
  try {
    const belongTo = getState().user.attributes["custom:managerName"];
    const { totalDistinct, numberOfItems, totalQuantity, itemsValue } =
      computeCollectionInfos(element.data);

    const collection = new Collection({
      name: element.title.toLowerCase(),
      numberOfItems,
      totalDistinct,
      totalQuantity,
      itemsValue,
      isDeleted: false,
      image: null,
      isOnline: false,
      type: "collection",
      belongTo,
    });
    dispatch(createCollection(collection, true, false, true));
    element.data.forEach((item) => {
      const { numberOfItems, totalQuantity, itemsValue } =
        computeCollectionInfos(item.data, 1);

      const subCollection = new Collection({
        name: item.title.toLowerCase(),
        parentCollectionID: collection.id,
        numberOfItems,
        totalQuantity,
        itemsValue,
        totalDistinct: 0,
        isDeleted: false,
        image: null,
        isOnline: false,
        type: "subCollection",
        belongTo,
      });
      dispatch(
        createSubCollection(subCollection, false, true, true, element.title)
      );
      item.data.forEach((item) => {
        let color = COLORS.find((item) => item.key === item[7]);

        color = color
          ? JSON.stringify(color)
          : JSON.stringify({ key: "", value: "#fff" });

        const options = item[8]?.split(";") ?? [];

        const formatted_options = options.map((item) => {
          const option = item.split(":");
          return { title: option[0], value: option[1] };
        });

        const tax = item[9]?.split(";") ?? [];

        const formatted_tax = tax.map((item) => {
          const option = item.split(":");
          return { title: option[0], value: option[1] };
        });

        const article = {
          name: item[0],
          priceIn: item[1],
          priceOut: item[2],
          currentQty: item[3],
          alertQty: item[4],
          sku: item[5],
          // size: item[6],
          color,
          isAutoReorder: false,
          reorderQty: 0,
          options: JSON.stringify(formatted_options),
          tax: JSON.stringify(formatted_tax),
          description: JSON.stringify({ text: item[10], html: "" }),
          note: item[11],
          collectionID: subCollection.id,
          createdAt: timestampWithoutHour(new Date().valueOf()).toString(),
          images: [],
          newInterval: [],
          secQty: 0,
          isDeleted: false,
          isVariant: false,
          isClone: false,
          validationStatus: ValidationStatus.CHECKED,
        };

        dispatch(
          createArticle({
            article,
            orders_data: {
              providers: [],
              priceIn: article.priceIn,
              paymentType: "cash",
            },
            skipUpdate: true,
            logImport: true,
          })
        );
      });
    });
  } catch (error) {
    console.log("put in stock error", error);
  }
};

const putAllInStock = (data) => async (dispatch) => {
  try {
    data.forEach((item) => {
      dispatch(putOneInStock(item));
    });
  } catch (error) {
    console.log("put all in stock ", error);
  }
};

const computeCollectionInfos = (data, deep = 2) => {
  const numberOfItems = data.length;
  const to_compute = [];
  data.forEach((item) => {
    if (deep !== 2) {
      to_compute.push([Number(item[1]), Number(item[3])]);
    } else {
      item.data.forEach((item) => {
        to_compute.push([Number(item[1]), Number(item[3])]);
      });
    }
  });
  const totalDistinct = to_compute.length;
  const itemsValue = to_compute.reduce(
    (prev, curr) => prev + curr[0] * curr[1],
    0
  );
  const totalQuantity = to_compute.reduce((prev, curr) => prev + curr[1], 0);

  return { totalDistinct, numberOfItems, totalQuantity, itemsValue };
};

export {
  createStoreValueTrack,
  getStoreValueTrack,
  computeCurrentStoreValue,
  exportToCsv,
  fromCsvToInventory,
};
